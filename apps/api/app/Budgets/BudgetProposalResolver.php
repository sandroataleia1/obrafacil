<?php

namespace App\Budgets;

use App\Models\Budget;
use App\Models\BudgetItem;
use App\Models\Scopes\CompanyScope;

/**
 * BUDGET-API-01. The ONE dedicated place that resolves a Budget by its
 * public `proposal_token`, deliberately bypassing ONLY the tenant
 * CompanyScope for this single lookup (`Budget::withoutCompanyScope()`,
 * already exposed by `BelongsToCompany` for exactly this kind of
 * deliberate cross-tenant operation) — the public proposal routes run
 * with NO Sanctum auth and NO `resolve-current-company` middleware, so
 * there is no `CurrentCompanyContext` to scope against at all; the
 * normal tenant-scoped `Budget::query()` would simply throw.
 *
 * Never call `Budget::withoutCompanyScope()` anywhere else in this
 * domain — every other Budget lookup goes through the normal, tenant-
 * scoped `Budget::query()`.
 */
class BudgetProposalResolver
{
    public function resolveByToken(string $token): Budget
    {
        return Budget::withoutCompanyScope()
            ->where('proposal_token', $token)
            ->with(['items' => fn ($query) => $query->withoutGlobalScope(CompanyScope::class)])
            ->firstOrFail();
    }

    /**
     * Same CompanyScope-bypass discipline, applied to a Budget instance
     * already resolved elsewhere in the public flow (e.g. after
     * BudgetProposalService::approve()/reject()) — `->load('items')`
     * would otherwise apply BudgetItem's own CompanyScope and throw with
     * no CurrentCompanyContext set on a public request.
     */
    public function loadItemsWithoutScope(Budget $budget): Budget
    {
        $budget->setRelation(
            'items',
            BudgetItem::withoutGlobalScope(CompanyScope::class)->where('budget_id', $budget->id)->orderBy('sort_order')->orderBy('id')->get()
        );

        return $budget;
    }
}
