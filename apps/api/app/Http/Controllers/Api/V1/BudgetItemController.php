<?php

namespace App\Http\Controllers\Api\V1;

use App\Budgets\BudgetItemService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBudgetItemRequest;
use App\Http\Requests\UpdateBudgetItemRequest;
use App\Http\Resources\BudgetItemResource;
use App\Models\Budget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Nested under /budgets/{budget}/items — mirrors ServiceOrderItemController's
 * pattern: neither `{budget}` nor `{item}` are ever type-hinted as a
 * model. `{item}` is resolved via `$budget->items()->findOrFail()` so a
 * cross-budget item id throws ModelNotFoundException -> a real 404.
 *
 * Every action here is draft-only — enforced inside BudgetItemService via
 * BudgetLocker (a 409 when the Budget is no longer draft).
 */
class BudgetItemController extends Controller
{
    public function __construct(private readonly BudgetItemService $service) {}

    public function store(StoreBudgetItemRequest $request, string $budget): JsonResponse
    {
        $model = Budget::query()->findOrFail($budget);
        $item = $this->service->addItem($model, $request->validated());

        return (new BudgetItemResource($item))->response()->setStatusCode(201);
    }

    public function update(UpdateBudgetItemRequest $request, string $budget, string $item): BudgetItemResource
    {
        $model = Budget::query()->findOrFail($budget);
        $itemModel = $model->items()->findOrFail($item);
        $itemModel = $this->service->updateItem($model, $itemModel, $request->validated());

        return new BudgetItemResource($itemModel);
    }

    public function destroy(string $budget, string $item): Response
    {
        $model = Budget::query()->findOrFail($budget);
        $itemModel = $model->items()->findOrFail($item);
        $this->service->deleteItem($model, $itemModel);

        return response()->noContent();
    }
}
