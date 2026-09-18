<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListSupplierRequest;
use App\Http\Requests\StoreSupplierRequest;
use App\Http\Requests\UpdateSupplierRequest;
use App\Http\Resources\SupplierListResource;
use App\Http\Resources\SupplierResource;
use App\Models\Supplier;
use App\Suppliers\SupplierService;
use App\Support\Document;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01A §29. `{supplier}` is deliberately never implicit
 * route-model binding — same reasoning as MaterialController/
 * CustomerController.
 */
class SupplierController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly SupplierService $service) {}

    public function index(ListSupplierRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $suppliers = Supplier::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->has('active'), fn (Builder $query) => $query->where('active', $request->boolean('active')))
            ->orderBy('name')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        return SupplierListResource::collection($suppliers);
    }

    public function store(StoreSupplierRequest $request): JsonResponse
    {
        $supplier = $this->service->create($request->validated());

        return (new SupplierResource($supplier))->response()->setStatusCode(201);
    }

    public function show(string $supplier): SupplierResource
    {
        $model = Supplier::query()->findOrFail($supplier);

        return new SupplierResource($model);
    }

    public function update(UpdateSupplierRequest $request, string $supplier): SupplierResource
    {
        $model = Supplier::query()->findOrFail($supplier);
        $model = $this->service->update($model, $request->validated());

        return new SupplierResource($model);
    }

    public function destroy(string $supplier): Response
    {
        $model = Supplier::query()->findOrFail($supplier);
        $this->service->delete($model);

        return response()->noContent();
    }

    /**
     * §27: matches `name` always; also matches the canonical
     * (digits-only) `document` column when the search term itself
     * contains digits — never a speculative address/notes search.
     */
    private function applySearch(Builder $query, string $term): void
    {
        $digits = Document::digitsOnly($term) ?? '';

        $query->where(function (Builder $inner) use ($term, $digits) {
            $inner->whereRaw('name ILIKE ?', ["%{$term}%"]);

            if ($digits !== '') {
                $inner->orWhere('document', 'like', "%{$digits}%");
            }
        });
    }
}
