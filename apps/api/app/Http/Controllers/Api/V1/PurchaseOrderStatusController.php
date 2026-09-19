<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PurchaseOrderStatusActionRequest;
use App\Http\Resources\PurchaseOrderResource;
use App\Models\PurchaseOrder;
use App\Purchases\PurchaseOrderFulfillmentService;
use App\Purchases\PurchaseOrderStatusService;

/**
 * SUPPLY-API-01C §22/§72. Status only ever changes via these explicit
 * actions — never the generic PUT (§21).
 */
class PurchaseOrderStatusController extends Controller
{
    public function __construct(
        private readonly PurchaseOrderStatusService $service,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
    ) {}

    public function confirm(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->confirm($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($this->loadForDetail($purchaseOrderModel));
    }

    public function cancel(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->cancel($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($this->loadForDetail($purchaseOrderModel));
    }

    public function returnToDraft(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->returnToDraft($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($this->loadForDetail($purchaseOrderModel));
    }

    private function loadForDetail(PurchaseOrder $purchaseOrder): PurchaseOrder
    {
        $purchaseOrder->load(['items.material', 'goodsReceipts.items']);
        $this->fulfillmentService->computeAndAttach($purchaseOrder);

        return $purchaseOrder;
    }
}
