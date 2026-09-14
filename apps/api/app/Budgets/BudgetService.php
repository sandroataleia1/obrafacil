<?php

namespace App\Budgets;

use App\Budgets\Exceptions\BudgetStatusConflictException;
use App\Enums\BudgetDecisionSource;
use App\Enums\BudgetStatus;
use App\Models\Budget;
use App\Models\Customer;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * BUDGET-API-01. The single place a Budget header is created/updated/
 * transitioned — controllers stay thin. `create()` is one atomic
 * transaction: number allocation, Customer resolution + snapshot copy,
 * initial items, and totals all succeed or all roll back together
 * (including the sequence increment — see BudgetNumberAllocator's
 * docblock).
 *
 * `updateHeader()`/`submit()`/`approveManually()`/`rejectManually()` each
 * wrap their ENTIRE body in `DB::transaction()` and lock the target row
 * (`BudgetLocker::lock()`, a real `SELECT ... FOR UPDATE`) as the very
 * first statement — before reading `status`/anything else. A `$budget`
 * instance the caller loaded before the call is never trusted for those
 * fields; only the locked, freshly-queried instance is authoritative.
 */
class BudgetService
{
    public function __construct(
        private readonly BudgetNumberAllocator $numberAllocator,
        private readonly BudgetItemService $itemService,
        private readonly BudgetLocker $locker,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(array $validated, User $actingUser): Budget
    {
        return DB::transaction(function () use ($validated, $actingUser) {
            $companyId = app(CurrentCompanyContext::class)->id();

            $customer = Customer::query()->findOrFail($validated['customer_id']);

            $discountAmount = Money::normalize((string) ($validated['discount_amount'] ?? '0.00'));

            $number = $this->numberAllocator->allocate($companyId);

            $budget = Budget::create(array_merge(
                [
                    'number' => $number,
                    'status' => BudgetStatus::Draft,
                    'title' => $validated['title'],
                    'reference' => $validated['reference'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'sale_subtotal' => '0.00',
                    'discount_amount' => '0.00',
                    'total' => '0.00',
                    'created_by_user_id' => $actingUser->id,
                ],
                $this->customerSnapshot($customer),
                ['customer_id' => $customer->id]
            ));

            foreach (($validated['items'] ?? []) as $itemInput) {
                $this->itemService->addItemWithoutLocking($budget, $itemInput);
            }

            $this->itemService->recalculateTotals($budget);

            $budget->refresh();
            $this->assertDiscountWithinSaleSubtotal($discountAmount, (string) $budget->sale_subtotal);
            $budget->discount_amount = $discountAmount;
            $budget->total = BudgetCalculator::total((string) $budget->sale_subtotal, $discountAmount);
            $budget->save();

            return $budget->fresh(['items']);
        });
    }

    /**
     * §: draft-only. customer_id/title/reference/notes/discount_amount.
     * A customer change always recopies the snapshot from whatever is in
     * the payload — never trusts a snapshot from the frontend.
     *
     * @param  array<string, mixed>  $validated
     */
    public function updateHeader(Budget|string $budget, array $validated): Budget
    {
        return DB::transaction(function () use ($budget, $validated) {
            $lockedBudget = $this->locker->lock($budget);
            $this->assertMutable($lockedBudget);

            $customer = Customer::query()->findOrFail($validated['customer_id']);
            $discountAmount = Money::normalize((string) ($validated['discount_amount'] ?? '0.00'));
            $this->assertDiscountWithinSaleSubtotal($discountAmount, (string) $lockedBudget->sale_subtotal);

            $lockedBudget->fill(array_merge(
                [
                    'title' => $validated['title'],
                    'reference' => $validated['reference'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'discount_amount' => $discountAmount,
                    'total' => BudgetCalculator::total((string) $lockedBudget->sale_subtotal, $discountAmount),
                ],
                $this->customerSnapshot($customer),
                ['customer_id' => $customer->id]
            ));
            $lockedBudget->save();

            return $lockedBudget;
        });
    }

    /**
     * draft -> pending_approval. Generates `proposal_token` (always null
     * before this point), sets `submitted_at`. Header/items are already
     * frozen from this point on purely by `status` no longer being
     * `draft` — every mutation route re-checks `isMutable()` on the
     * freshly-locked row, so there is no separate snapshot to maintain.
     */
    public function submit(Budget|string $budget): Budget
    {
        return DB::transaction(function () use ($budget) {
            $lockedBudget = $this->locker->lock($budget);

            if (! $lockedBudget->status->isMutable()) {
                throw new BudgetStatusConflictException('Este orçamento já foi enviado e não pode ser enviado novamente.');
            }

            $lockedBudget->status = BudgetStatus::PendingApproval;
            $lockedBudget->submitted_at = now();
            $lockedBudget->proposal_token ??= $this->generateUniqueToken();
            $lockedBudget->save();

            return $lockedBudget->fresh(['items']);
        });
    }

    /**
     * Authenticated, tenant-scoped manual decision.
     */
    public function approveManually(Budget|string $budget, User $actingUser, ?string $note = null): Budget
    {
        return $this->decideManually($budget, $actingUser, BudgetStatus::Approved, $note);
    }

    public function rejectManually(Budget|string $budget, User $actingUser, ?string $note = null): Budget
    {
        return $this->decideManually($budget, $actingUser, BudgetStatus::Rejected, $note);
    }

    private function decideManually(Budget|string $budget, User $actingUser, BudgetStatus $target, ?string $note = null): Budget
    {
        return DB::transaction(function () use ($budget, $actingUser, $target, $note) {
            $lockedBudget = $this->locker->lock($budget);
            $this->assertPendingApproval($lockedBudget);

            $lockedBudget->status = $target;
            $lockedBudget->decision_source = BudgetDecisionSource::ManualInternal;
            $lockedBudget->decision_by_user_id = $actingUser->id;
            $lockedBudget->decision_by_name = null;
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
                    ? 'Este orçamento já recebeu uma decisão.'
                    : 'Este orçamento ainda não foi enviado para aprovação.'
            );
        }
    }

    private function assertMutable(Budget $budget): void
    {
        if (! $budget->status->isMutable()) {
            throw new BudgetStatusConflictException('Este orçamento não está mais em rascunho e não pode ser editado.');
        }
    }

    private function assertDiscountWithinSaleSubtotal(string $discountAmount, string $saleSubtotal): void
    {
        if (Money::compare($discountAmount, $saleSubtotal) > 0) {
            throw ValidationException::withMessages([
                'discount_amount' => 'O desconto não pode ser maior que o subtotal de venda.',
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function customerSnapshot(Customer $customer): array
    {
        return [
            'customer_name' => $customer->name,
            'customer_document' => $customer->document,
            'customer_phone' => $customer->phone,
            'customer_email' => $customer->email,
        ];
    }

    private function generateUniqueToken(): string
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $token = Str::lower(Str::random(48));
            if (! Budget::withoutCompanyScope()->where('proposal_token', $token)->exists()) {
                return $token;
            }
        }

        throw new \RuntimeException('Não foi possível gerar um token único para a proposta.');
    }
}
