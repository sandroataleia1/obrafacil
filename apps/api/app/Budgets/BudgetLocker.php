<?php

namespace App\Budgets;

use App\Models\Budget;

/**
 * BUDGET-API-01. The single place a Budget row is pessimistically locked
 * for a mutation. `budgets.id` is the transactional mutex for that
 * Budget — every mutating method (header update, item add/update/delete,
 * submit, manual approve/reject, public approve/reject) MUST call this
 * from within its own `DB::transaction()` closure before touching
 * anything else, and treat only the returned, freshly-locked instance as
 * authoritative. Never call this outside an open transaction —
 * `SELECT ... FOR UPDATE` without a surrounding transaction is a no-op
 * lock.
 *
 * This same lock is what serializes a public-link decision against a
 * manual-internal decision, and an item mutation against a submit — two
 * concurrent terminal decisions on the same Budget can only ever resolve
 * to exactly one winner, the other observing the post-lock (already
 * terminal) state and getting a clean 409, never a silently overwritten
 * decision.
 */
class BudgetLocker
{
    public function lock(Budget|string $budget): Budget
    {
        $id = $budget instanceof Budget ? $budget->id : $budget;

        return Budget::query()
            ->whereKey($id)
            ->lockForUpdate()
            ->firstOrFail();
    }

    /**
     * Same lock, resolved via the tenant-bypassing public lookup (token
     * instead of id) — used only by the public proposal decision flow.
     */
    public function lockByToken(string $token): Budget
    {
        return Budget::withoutCompanyScope()
            ->where('proposal_token', $token)
            ->lockForUpdate()
            ->firstOrFail();
    }
}
