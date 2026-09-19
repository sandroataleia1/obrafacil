<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreGoodsReceiptRequest;
use App\Http\Resources\GoodsReceiptResource;
use App\Models\PurchaseOrder;
use App\Purchases\GoodsReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * SUPPLY-API-01D §64-65. Nested under /purchase-orders/{purchaseOrder}/
 * goods-receipts — mirrors PurchaseOrderItemController: neither
 * `{purchaseOrder}` nor `{goodsReceipt}` are ever type-hinted as a model.
 * No PUT/PATCH (§2) and no standalone top-level route (§65) — a
 * GoodsReceipt only ever exists nested to its Order.
 */
class GoodsReceiptController extends Controller
{
    public function __construct(private readonly GoodsReceiptService $service) {}

    public function store(StoreGoodsReceiptRequest $request, string $purchaseOrder): JsonResponse
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $receipt = $this->service->create($purchaseOrderModel, $request->validated());

        return (new GoodsReceiptResource($receipt))->response()->setStatusCode(201);
    }

    public function destroy(string $purchaseOrder, string $goodsReceipt): Response
    {
        $purchaseOrderModel = PurchaseOrder::query()->findOrFail($purchaseOrder);
        $this->service->delete($purchaseOrderModel, $goodsReceipt);

        return response()->noContent();
    }
}
