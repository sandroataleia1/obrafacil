<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListStockMovementRequest;
use App\Http\Requests\ListStockPositionRequest;
use App\Http\Resources\StockMovementResource;
use App\Http\Resources\StockPositionResource;
use App\Models\Material;
use App\Models\Project;
use App\Stock\StockPositionService;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * SUPPLY-API-01E §60/§62-64/§66. `{project}`/`{material}` are always
 * resolved via Eloquent (`findOrFail`), which is what makes cross-tenant
 * access a real 404 — `CompanyScope` applies automatically to both models.
 */
class StockPositionController extends Controller
{
    public function __construct(private readonly StockPositionService $service) {}

    public function index(ListStockPositionRequest $request): AnonymousResourceCollection
    {
        if ($request->filled('project_id')) {
            Project::query()->findOrFail($request->validated('project_id'));
        }

        $positions = $this->service->listPositions($request->validated());

        return StockPositionResource::collection($positions);
    }

    public function show(string $project, string $material): StockPositionResource
    {
        $projectModel = Project::query()->findOrFail($project);
        $materialModel = Material::query()->findOrFail($material);

        $metrics = $this->service->getPosition($projectModel->id, $materialModel->id);

        $row = (object) array_merge($metrics, [
            'project_id' => $projectModel->id,
            'project_number' => $projectModel->number,
            'project_name' => $projectModel->name,
            'material_id' => $materialModel->id,
            'material_name' => $materialModel->name,
            'material_unit_code' => $materialModel->unit_code->value,
            'material_unit_custom_label' => $materialModel->unit_custom_label,
            'material_active' => $materialModel->active,
        ]);

        return new StockPositionResource($row);
    }

    public function movements(ListStockMovementRequest $request, string $project, string $material): AnonymousResourceCollection
    {
        $projectModel = Project::query()->findOrFail($project);
        $materialModel = Material::query()->findOrFail($material);

        $materialInfo = [
            'id' => $materialModel->id,
            'name' => $materialModel->name,
            'unit_code' => $materialModel->unit_code->value,
            'unit_custom_label' => $materialModel->unit_custom_label,
            'active' => $materialModel->active,
        ];

        $movements = $this->service->listMovements($projectModel->id, $materialModel->id, $request->validated());

        $movements->setCollection($movements->getCollection()->map(function ($row) use ($projectModel, $materialInfo) {
            $row->project_id = $projectModel->id;
            $row->material = $materialInfo;

            return $row;
        }));

        return StockMovementResource::collection($movements);
    }
}
