<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceOrderItemRequest;
use App\Http\Requests\UpdateServiceOrderItemRequest;
use App\Http\Resources\ServiceOrderItemResource;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderItemService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Nested under /service-orders/{serviceOrder}/items — mirrors
 * CustomerAddressController's pattern: neither `{serviceOrder}` nor
 * `{item}` are ever type-hinted as a model. `{item}` is resolved via
 * `$serviceOrder->items()->findOrFail()` so a cross-order item id (§54/T7)
 * throws ModelNotFoundException -> a real 404, indistinguishable from
 * "item doesn't exist at all", never a mutation of another order's line.
 *
 * §43: DELETE here removes a *line item*, never the ServiceOrder itself.
 */
class ServiceOrderItemController extends Controller
{
    public function __construct(private readonly ServiceOrderItemService $service) {}

    public function store(StoreServiceOrderItemRequest $request, string $serviceOrder): JsonResponse
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $item = $this->service->addItem($order, $request->validated());

        return (new ServiceOrderItemResource($item))->response()->setStatusCode(201);
    }

    public function update(UpdateServiceOrderItemRequest $request, string $serviceOrder, string $item): ServiceOrderItemResource
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $itemModel = $order->items()->findOrFail($item);
        $itemModel = $this->service->updateItem($order, $itemModel, $request->validated());

        return new ServiceOrderItemResource($itemModel);
    }

    public function destroy(string $serviceOrder, string $item): Response
    {
        $order = ServiceOrder::query()->findOrFail($serviceOrder);
        $itemModel = $order->items()->findOrFail($item);
        $this->service->deleteItem($order, $itemModel);

        return response()->noContent();
    }
}
