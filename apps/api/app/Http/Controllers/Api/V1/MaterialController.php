<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListMaterialRequest;
use App\Http\Requests\StoreMaterialRequest;
use App\Http\Requests\UpdateMaterialRequest;
use App\Http\Resources\MaterialListResource;
use App\Http\Resources\MaterialResource;
use App\Materials\MaterialService;
use App\Models\Material;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01A §29. `{material}` is deliberately never implicit
 * route-model binding — same reasoning as CatalogItemController/
 * CustomerController: SubstituteBindings runs before
 * `resolve-current-company` in this app's middleware priority, so a
 * tenant-scoped implicit binding would try to query Material before
 * CurrentCompanyContext is set. Every lookup happens explicitly, inside
 * the action, after tenant context is guaranteed — which also makes a
 * cross-tenant id naturally 404 (CompanyScope never finds the row), never
 * a revealing 403.
 */
class MaterialController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly MaterialService $service) {}

    public function index(ListMaterialRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $materials = Material::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->has('active'), fn (Builder $query) => $query->where('active', $request->boolean('active')))
            ->orderBy('name')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        return MaterialListResource::collection($materials);
    }

    public function store(StoreMaterialRequest $request): JsonResponse
    {
        $material = $this->service->create($request->validated());

        return (new MaterialResource($material))->response()->setStatusCode(201);
    }

    public function show(string $material): MaterialResource
    {
        $model = Material::query()->findOrFail($material);

        return new MaterialResource($model);
    }

    public function update(UpdateMaterialRequest $request, string $material): MaterialResource
    {
        $model = Material::query()->findOrFail($material);
        $model = $this->service->update($model, $request->validated());

        return new MaterialResource($model);
    }

    public function destroy(string $material): Response
    {
        $model = Material::query()->findOrFail($material);
        $this->service->delete($model);

        return response()->noContent();
    }

    private function applySearch(Builder $query, string $term): void
    {
        $query->whereRaw('name ILIKE ?', ["%{$term}%"]);
    }
}
