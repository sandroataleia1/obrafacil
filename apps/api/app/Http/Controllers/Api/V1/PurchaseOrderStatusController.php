<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PurchaseOrderStatusActionRequest;
use App\Http\Resources\PurchaseOrderResource;
use App\Models\PurchaseOrder;
use App\Purchases\PurchaseOrderStatusService;

/**
 * SUPPLY-API-01C §22/§72. Status only ever changes via these explicit
 * actions — never the generic PUT (§21).
 */
class PurchaseOrderStatusController extends Controller
{
    public function __construct(private readonly PurchaseOrderStatusService $service) {}

    public function confirm(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->confirm($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($purchaseOrderModel->load('items.material'));
    }

    public function cancel(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->cancel($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($purchaseOrderModel->load('items.material'));
    }

    public function returnToDraft(PurchaseOrderStatusActionRequest $request, string $purchaseOrder): PurchaseOrderResource
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $purchaseOrderModel = $this->service->returnToDraft($purchaseOrderModel, $request->validated('updated_at'));

        return new PurchaseOrderResource($purchaseOrderModel->load('items.material'));
    }
}
