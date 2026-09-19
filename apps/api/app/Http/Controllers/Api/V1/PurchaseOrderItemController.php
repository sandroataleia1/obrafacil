<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseOrderItemRequest;
use App\Http\Requests\UpdatePurchaseOrderItemRequest;
use App\Http\Resources\PurchaseOrderItemResource;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Purchases\PurchaseOrderFulfillmentService;
use App\Purchases\PurchaseOrderItemService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01C §34/§72. Nested under /purchase-orders/{purchaseOrder}/items
 * — mirrors ServiceOrderItemController: neither `{purchaseOrder}` nor
 * `{item}` are ever type-hinted as a model. `{item}` is always resolved
 * scoped to the already-resolved `{purchaseOrder}`
 * (`$purchaseOrder->items()->findOrFail()`), so an item id from a
 * different Order (§34) or a different tenant is indistinguishable from
 * "doesn't exist" — a real 404.
 *
 * SUPPLY-API-01D §29/§62: a single Item is at stake per request here, so
 * `PurchaseOrderFulfillmentService::receivedQuantityForItem()`'s one
 * extra query is not a meaningful cost — never batch machinery needed
 * for a single-row response.
 */
class PurchaseOrderItemController extends Controller
{
    public function __construct(
        private readonly PurchaseOrderItemService $service,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
    ) {}

    public function store(StorePurchaseOrderItemRequest $request, string $purchaseOrder): JsonResponse
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $item = $this->service->addItem($purchaseOrderModel, $request->validated());

        return (new PurchaseOrderItemResource($this->attachFulfillment($item->load('material'))))->response()->setStatusCode(201);
    }

    public function update(UpdatePurchaseOrderItemRequest $request, string $purchaseOrder, string $item): PurchaseOrderItemResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $itemModel = $purchaseOrderModel->items()->findOrFail($item);
        $itemModel = $this->service->updateItem($purchaseOrderModel, $itemModel, $request->validated());

        return new PurchaseOrderItemResource($this->attachFulfillment($itemModel->load('material')));
    }

    public function destroy(string $purchaseOrder, string $item): Response
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $itemModel = $purchaseOrderModel->items()->findOrFail($item);
        $this->service->deleteItem($purchaseOrderModel, $itemModel);

        return response()->noContent();
    }

    private function attachFulfillment(PurchaseOrderItem $item): PurchaseOrderItem
    {
        $received = $this->fulfillmentService->receivedQuantityForItem($item);
        $item->fulfillment = $this->fulfillmentService->itemFulfillment($item, $received);

        return $item;
    }
}
