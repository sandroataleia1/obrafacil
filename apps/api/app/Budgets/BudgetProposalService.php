<?php

namespace App\Budgets;

use App\Budgets\Exceptions\BudgetStatusConflictException;
use App\Enums\BudgetDecisionSource;
use App\Enums\BudgetStatus;
use App\Models\Budget;
use Illuminate\Support\Facades\DB;

/**
 * BUDGET-API-01. Public (unauthenticated) proposal decision flow —
 * `POST /proposals/{token}/approve|reject`. Locks the Budget by token
 * (`BudgetLocker::lockByToken()`, still a real `SELECT ... FOR UPDATE`,
 * still bypassing only CompanyScope) as the very first statement inside
 * the transaction, exactly like every other Budget mutation — this is
 * what serializes a public decision against a concurrent manual-internal
 * decision on the same Budget: whichever transaction acquires the lock
 * first commits its decision, the other observes the post-lock
 * (already-terminal) status and cleanly 409s, never silently overwriting
 * the first decision.
 */
class BudgetProposalService
{
    public function __construct(private readonly BudgetLocker $locker) {}

    public function approve(string $token, string $decidedByName, ?string $note = null): Budget
    {
        return $this->decide($token, $decidedByName, BudgetStatus::Approved, $note);
    }

    public function reject(string $token, string $decidedByName, ?string $note = null): Budget
    {
        return $this->decide($token, $decidedByName, BudgetStatus::Rejected, $note);
    }

    private function decide(string $token, string $decidedByName, BudgetStatus $target, ?string $note = null): Budget
    {
        return DB::transaction(function () use ($token, $decidedByName, $target, $note) {
            $lockedBudget = $this->locker->lockByToken($token);
            $this->assertPendingApproval($lockedBudget);

            $lockedBudget->status = $target;
            $lockedBudget->decision_source = BudgetDecisionSource::PublicLink;
            $lockedBudget->decision_by_user_id = null;
            $lockedBudget->decision_by_name = $decidedByName;
            $lockedBudget->decision_note = $note;
            $lockedBudget->decided_at = now();
            $lockedBudget->save();

            return $lockedBudget;
        });
    }

    private function assertPendingApproval(Budget $budget): void
    {
        if ($budget->status !== BudgetStatus::PendingApproval) {
            throw new BudgetStatusConflictException(
                $budget->status->isTerminal()
                    ? 'Esta proposta já recebeu uma decisão.'
                    : 'Esta proposta ainda não está disponível para decisão.'
            );
        }
    }
}
