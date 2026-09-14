<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\BudgetService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveBudgetManuallyRequest;
use App\Http\Requests\RejectBudgetManuallyRequest;
use App\Http\Resources\BudgetResource;
use App\Models\Budget;

/**
 * POST /budgets/{budget}/submit, /approve-manually, /reject-manually —
 * all authenticated, tenant-scoped. `decided_by`/`decision_source` are
 * always server-derived from the authenticated user, never the request
 * body.
 */
class BudgetStatusController extends Controller
{
    public function __construct(private readonly BudgetService $service) {}

    public function submit(string $budget): BudgetResource
    {
        $model = Budget::query()->findOrFail($budget);
        $model = $this->service->submit($model);

        return new BudgetResource($model);
    }

    public function approveManually(ApproveBudgetManuallyRequest $request, string $budget): BudgetResource
    {
        $model = Budget::query()->findOrFail($budget);
        $model = $this->service->approveManually($model, $request->user(), $request->input('note'));

        return new BudgetResource($model);
    }

    public function rejectManually(RejectBudgetManuallyRequest $request, string $budget): BudgetResource
    {
        $model = Budget::query()->findOrFail($budget);
        $model = $this->service->rejectManually($model, $request->user(), $request->input('note'));

        return new BudgetResource($model);
    }
}
