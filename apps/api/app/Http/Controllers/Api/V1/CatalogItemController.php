<?php

namespace App\Http\Controllers\Api\V1;

use App\CatalogItems\CatalogItemService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListCatalogItemRequest;
use App\Http\Requests\StoreCatalogItemRequest;
use App\Http\Requests\UpdateCatalogItemRequest;
use App\Http\Resources\CatalogItemResource;
use App\Models\CatalogItem;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * §21: `{catalogItem}` is deliberately never implicit route-model binding
 * — same reasoning as CustomerController: SubstituteBindings runs before
 * `resolve-current-company` in this app's middleware priority, so a
 * tenant-scoped implicit binding would try to query CatalogItem before
 * CurrentCompanyContext is set. Every lookup happens explicitly, inside
 * the action, after tenant context is guaranteed — which also makes a
 * cross-tenant id naturally 404 (CompanyScope never finds the row) rather
 * than a 500 or a revealing 403.
 *
 * §18: no destroy() — there is no DELETE route (§48).
 */
class CatalogItemController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly CatalogItemService $service) {}

    public function index(ListCatalogItemRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $items = CatalogItem::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->filled('type'), fn (Builder $query) => $query->where('type', $request->input('type')))
            ->when($request->has('active'), fn (Builder $query) => $query->where('active', $request->boolean('active')))
            // §31: active DESC, name ASC, id ASC — deterministic, geared
            // toward catalog management (active items surface first).
            ->orderByDesc('active')
            ->orderBy('name')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        return CatalogItemResource::collection($items);
    }

    public function store(StoreCatalogItemRequest $request): JsonResponse
    {
        $item = $this->service->create($request->validated());

        return (new CatalogItemResource($item))->response()->setStatusCode(201);
    }

    public function show(string $catalogItem): CatalogItemResource
    {
        $model = CatalogItem::query()->findOrFail($catalogItem);

        return new CatalogItemResource($model);
    }

    public function update(UpdateCatalogItemRequest $request, string $catalogItem): CatalogItemResource
    {
        $model = CatalogItem::query()->findOrFail($catalogItem);
        $model = $this->service->update($model, $request->validated());

        return new CatalogItemResource($model);
    }

    private function applySearch(Builder $query, string $term): void
    {
        $query->where(function (Builder $inner) use ($term) {
            $inner->whereRaw('name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('code ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('category ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('description ILIKE ?', ["%{$term}%"]);
        });
    }
}
