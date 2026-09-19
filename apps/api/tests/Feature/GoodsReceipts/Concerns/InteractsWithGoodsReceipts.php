<?php

namespace Tests\Feature\GoodsReceipts\Concerns;

use App\Models\Company;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;

trait InteractsWithGoodsReceipts
{
    use InteractsWithPurchaseOrders;

    protected function makeGoodsReceiptForOrder(Company $company, PurchaseOrder $order, array $lines = [], array $attributes = []): GoodsReceipt
    {
        return $this->currentCompanyContext()->run(
            $company,
            function () use ($order, $lines, $attributes) {
                $attributes['purchase_order_id'] = $order->id;
                $receipt = GoodsReceipt::factory()->create($attributes);

                foreach ($lines as [$itemId, $quantity]) {
                    $receipt->items()->create(['purchase_order_item_id' => $itemId, 'quantity' => $quantity]);
                }

                return $receipt;
            }
        );
    }

    /**
     * Creates an `ordered` PurchaseOrder with exactly one Item, entirely
     * via HTTP, ready to receive goods. Returns the fresh Order array (as
     * decoded JSON) and the Item array.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    protected function createOrderedOrderWithItem(array $itemOverrides = []): array
    {
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson(
            "/api/v1/purchase-orders/{$order['id']}/items",
            $this->validPurchaseOrderItemPayload($itemOverrides)
        )->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson(
            "/api/v1/purchase-orders/{$order['id']}/confirm",
            ['updated_at' => $fresh['updated_at']]
        )->json();

        return [$confirmed, $item];
    }

    /**
     * @return array<string, mixed>
     */
    protected function validGoodsReceiptPayload(array $overrides = []): array
    {
        return array_merge([
            'received_at' => now()->toDateString(),
        ], $overrides);
    }

    protected function receiptsEndpoint(string $orderId, ?string $receiptId = null): string
    {
        $base = "/api/v1/purchase-orders/{$orderId}/goods-receipts";

        return $receiptId === null ? $base : "{$base}/{$receiptId}";
    }
}
