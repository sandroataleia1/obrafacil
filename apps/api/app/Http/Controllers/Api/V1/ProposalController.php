<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\BudgetProposalResolver;
use App\Budgets\BudgetProposalService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveProposalRequest;
use App\Http\Requests\RejectProposalRequest;
use App\Http\Resources\PublicProposalResource;

/**
 * PUBLIC routes — no Sanctum auth, no `resolve-current-company`
 * middleware, registered outside every authenticated group in
 * routes/api.php. `{token}` is the Budget's `proposal_token`, resolved
 * via BudgetProposalResolver (the ONE dedicated place that bypasses only
 * CompanyScope for this lookup) — never `Budget::query()->findOrFail()`,
 * which would throw with no CurrentCompanyContext set.
 */
class ProposalController extends Controller
{
    public function __construct(
        private readonly BudgetProposalResolver $resolver,
        private readonly BudgetProposalService $service,
    ) {}

    public function show(string $token): PublicProposalResource
    {
        $budget = $this->resolver->resolveByToken($token);

        return new PublicProposalResource($budget);
    }

    public function approve(ApproveProposalRequest $request, string $token): PublicProposalResource
    {
        $budget = $this->service->approve($token, $request->input('name'));

        return new PublicProposalResource($this->resolver->loadItemsWithoutScope($budget));
    }

    public function reject(RejectProposalRequest $request, string $token): PublicProposalResource
    {
        $budget = $this->service->reject($token, $request->input('name'), $request->input('reason'));

        return new PublicProposalResource($this->resolver->loadItemsWithoutScope($budget));
    }
}
