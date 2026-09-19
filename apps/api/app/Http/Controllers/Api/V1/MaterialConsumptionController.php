<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMaterialConsumptionRequest;
use App\Http\Resources\MaterialConsumptionResource;
use App\Models\MaterialConsumption;
use App\Models\Project;
use App\Stock\MaterialConsumptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01E §16/§69. Nested under /projects/{project}/material-consumptions
 * — mirrors MaterialRequirementController: neither `{project}` nor
 * `{consumption}` are ever type-hinted as a model. `{consumption}` is
 * always resolved scoped to the already-resolved `{project}` (§14), so a
 * Consumption id from a different Project/tenant is a real 404.
 */
class MaterialConsumptionController extends Controller
{
    public function __construct(private readonly MaterialConsumptionService $service) {}

    public function store(StoreMaterialConsumptionRequest $request, string $project): JsonResponse
    {
        $projectModel = Project::query()->findOrFail($project);
        $consumption = $this->service->create($projectModel, $request->validated());
        $consumption->load('material');

        return (new MaterialConsumptionResource($consumption))->response()->setStatusCode(201);
    }

    public function destroy(string $project, string $consumption): Response
    {
        $projectModel = Project::query()->findOrFail($project);
        $consumptionModel = MaterialConsumption::query()
            ->where('project_id', $projectModel->id)
            ->findOrFail($consumption);

        $this->service->delete($projectModel, $consumptionModel);

        return response()->noContent();
    }
}
