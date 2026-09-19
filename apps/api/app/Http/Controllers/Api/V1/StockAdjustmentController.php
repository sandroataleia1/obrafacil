<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockAdjustmentRequest;
use App\Http\Resources\StockAdjustmentResource;
use App\Models\Project;
use App\Stock\StockAdjustmentService;
use Illuminate\Http\JsonResponse;

/**
 * SUPPLY-API-01E §26/§68. Nested under /projects/{project}/stock-adjustments
 * — CREATE only, no update/delete route (§20/§68).
 */
class StockAdjustmentController extends Controller
{
    public function __construct(private readonly StockAdjustmentService $service) {}

    public function store(StoreStockAdjustmentRequest $request, string $project): JsonResponse
    {
        $projectModel = Project::query()->findOrFail($project);
        $adjustment = $this->service->create($projectModel, $request->validated());
        $adjustment->load('material');

        return (new StockAdjustmentResource($adjustment))->response()->setStatusCode(201);
    }
}
