<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListServiceOrderRequest;
use App\Http\Requests\StoreServiceOrderRequest;
use App\Http\Requests\UpdateServiceOrderRequest;
use App\Http\Resources\ServiceOrderListResource;
use App\Http\Resources\ServiceOrderResource;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * §54: `{serviceOrder}` is deliberately never implicit route-model binding
 * — same reasoning as CustomerController/CatalogItemController:
 * SubstituteBindings runs before `resolve-current-company` in this app's
 * middleware priority. Every lookup happens explicitly inside the action,
 * after tenant context is guaranteed, which also makes a cross-tenant id
 * naturally 404 rather than a 500 or a revealing 403.
 *
 * §12: no destroy() — there is no DELETE route (§83). No update of
 * `status` here — see ServiceOrderStatusController for start/complete/cancel.
 */
class ServiceOrderController extends Controller
{
    private const int DEFAULT_PER_PAGE = 15;

    private const int MAX_PER_PAGE = 100;

    public function __construct(private readonly ServiceOrderService $service) {}

    public function index(ListServiceOrderRequest $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->input('per_page', self::DEFAULT_PER_PAGE), self::MAX_PER_PAGE);
        $perPage = max($perPage, 1);

        $orders = ServiceOrder::query()
            ->when($request->filled('search'), fn (Builder $query) => $this->applySearch($query, (string) $request->input('search')))
            ->when($request->filled('status'), fn (Builder $query) => $query->where('status', $request->input('status')))
            ->when($request->filled('customer_id'), fn (Builder $query) => $query->where('customer_id', $request->input('customer_id')))
            // §56: deterministic — newest first, id as a stable tiebreaker.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString();

        return ServiceOrderListResource::collection($orders);
    }

    public function store(StoreServiceOrderRequest $request): JsonResponse
    {
        $order = $this->service->create($request->validated(), $request->user());

        return (new ServiceOrderResource($order))->response()->setStatusCode(201);
    }

    public function show(string $serviceOrder): ServiceOrderResource
    {
        $model = ServiceOrder::query()->with('items')->findOrFail($serviceOrder);

        return new ServiceOrderResource($model);
    }

    public function update(UpdateServiceOrderRequest $request, string $serviceOrder): ServiceOrderResource
    {
        $model = ServiceOrder::query()->findOrFail($serviceOrder);
        $model = $this->service->updateHeader($model, $request->validated());

        return new ServiceOrderResource($model->load('items'));
    }

    /**
     * §57: ILIKE across number (cast to text), title, description, and
     * the customer/contact/address snapshot fields — never a JOIN, since
     * everything searched already lives on this one row. A term shaped
     * like the human-facing "OS-000001" (§13/§15) is matched against the
     * real numeric `number` column exactly, never as a raw text substring
     * (the stored column never contains the "OS-" prefix or zero-padding).
     */
    private function applySearch(Builder $query, string $term): void
    {
        $numberFromFormatted = $this->extractNumberFromFormattedSearch($term);

        $query->where(function (Builder $inner) use ($term, $numberFromFormatted) {
            if ($numberFromFormatted !== null) {
                $inner->orWhere('number', $numberFromFormatted);
            } else {
                $inner->orWhereRaw('CAST(number AS TEXT) ILIKE ?', ["%{$term}%"]);
            }

            $inner->orWhereRaw('title ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('description ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('customer_name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('contact_name ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('execution_address_label ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('execution_street ILIKE ?', ["%{$term}%"])
                ->orWhereRaw('execution_city ILIKE ?', ["%{$term}%"]);
        });
    }

    private function extractNumberFromFormattedSearch(string $term): ?int
    {
        if (preg_match('/^OS-?0*(\d+)$/i', trim($term), $matches) !== 1) {
            return null;
        }

        return (int) $matches[1];
    }
}
