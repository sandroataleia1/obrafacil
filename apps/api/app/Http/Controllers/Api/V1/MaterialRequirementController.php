<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListMaterialRequirementRequest;
use App\Http\Requests\StoreMaterialRequirementRequest;
use App\Http\Requests\UpdateMaterialRequirementRequest;
use App\Http\Resources\MaterialRequirementResource;
use App\MaterialRequirements\MaterialRequirementService;
use App\Models\MaterialRequirement;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01B §13-14. Nested under /projects/{project}/material-requirements
 * — mirrors ServiceOrderItemController/CustomerAddressController: neither
 * `{project}` nor `{requirement}` are ever type-hinted as a model.
 * `{requirement}` is always resolved scoped to the already-resolved
 * `{project}` (`MaterialRequirement::query()->where('project_id', ...)
 * ->findOrFail()`), so a Requirement id from a different Project (§14/MR18)
 * or a different tenant is indistinguishable from "doesn't exist" — a real
 * 404, never a cross-project/cross-tenant read.
 */
class MaterialRequirementController extends Controller
{
    private const int DEFAULT_PER_PAGE = 50;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly MaterialRequirementService $service) {}

    public function index(ListMaterialRequirementRequest $request, string $project): AnonymousResourceCollection
    {
        $projectModel = Project::query()->findOrFail($project);

        $perPage = min(
            (int) ($request->validated('per_page') ?? self::DEFAULT_PER_PAGE),
            self::MAX_PER_PAGE
        );

        $requirements = MaterialRequirement::query()
            ->select('material_requirements.*')
            ->join('materials', 'materials.id', '=', 'material_requirements.material_id')
            ->where('material_requirements.project_id', $projectModel->id)
            ->orderBy('materials.name')
            ->orderBy('material_requirements.id')
            ->with('material')
            ->paginate($perPage)
            ->withQueryString();

        return MaterialRequirementResource::collection($requirements);
    }

    public function store(StoreMaterialRequirementRequest $request, string $project): JsonResponse
    {
        $projectModel = Project::query()->findOrFail($project);
        $requirement = $this->service->create($projectModel, $request->validated());
        $requirement->load('material');

        return (new MaterialRequirementResource($requirement))->response()->setStatusCode(201);
    }

    public function show(string $project, string $requirement): MaterialRequirementResource
    {
        $projectModel = Project::query()->findOrFail($project);
        $requirementModel = MaterialRequirement::query()
            ->where('project_id', $projectModel->id)
            ->with('material')
            ->findOrFail($requirement);

        return new MaterialRequirementResource($requirementModel);
    }

    public function update(UpdateMaterialRequirementRequest $request, string $project, string $requirement): MaterialRequirementResource
    {
        $projectModel = Project::query()->findOrFail($project);
        $requirementModel = MaterialRequirement::query()
            ->where('project_id', $projectModel->id)
            ->findOrFail($requirement);

        $requirementModel = $this->service->update($requirementModel, $request->validated());
        $requirementModel->load('material');

        return new MaterialRequirementResource($requirementModel);
    }

    public function destroy(string $project, string $requirement): Response
    {
        $projectModel = Project::query()->findOrFail($project);
        $requirementModel = MaterialRequirement::query()
            ->where('project_id', $projectModel->id)
            ->findOrFail($requirement);

        $this->service->delete($requirementModel);

        return response()->noContent();
    }
}
