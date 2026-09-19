<?php

namespace Tests\Feature\Stock\Concerns;

use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;

trait InteractsWithStock
{
    use InteractsWithGoodsReceipts;

    /**
     * Creates a confirmed (ordered) PurchaseOrder with one Item for the
     * given Project, and immediately receives the given quantity via
     * GoodsReceipt at `$receivedAt` (defaults today). Returns the fresh
     * Order/Item/Receipt JSON.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>, 2: array<string, mixed>}
     */
    protected function createReceivedStock(string $projectId, string $materialId, string $quantity, ?string $receivedAt = null): array
    {
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $projectId]))->json();
        $item = $this->postJson(
            "/api/v1/purchase-orders/{$order['id']}/items",
            $this->validPurchaseOrderItemPayload(['material_id' => $materialId, 'quantity' => $quantity])
        )->json();
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->json();

        $receipt = $this->postJson($this->receiptsEndpoint($confirmed['id']), $this->validGoodsReceiptPayload([
            'received_at' => $receivedAt ?? now()->toDateString(),
            'items' => [['purchase_order_item_id' => $item['id'], 'quantity' => $quantity]],
        ]))->json();

        return [$confirmed, $item, $receipt];
    }

    /**
     * @return array<string, mixed>
     */
    protected function validConsumptionPayload(array $overrides = []): array
    {
        return array_merge([
            'consumed_at' => now()->toDateString(),
        ], $overrides);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validAdjustmentPayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'ADJUSTMENT_IN',
            'quantity' => '10.000',
            'occurred_at' => now()->toDateString(),
        ], $overrides);
    }

    protected function consumptionsEndpoint(string $projectId, ?string $consumptionId = null): string
    {
        $base = "/api/v1/projects/{$projectId}/material-consumptions";

        return $consumptionId === null ? $base : "{$base}/{$consumptionId}";
    }

    protected function adjustmentsEndpoint(string $projectId): string
    {
        return "/api/v1/projects/{$projectId}/stock-adjustments";
    }

    protected function stockPositionsEndpoint(): string
    {
        return '/api/v1/stock/positions';
    }

    protected function stockDetailEndpoint(string $projectId, string $materialId): string
    {
        return "/api/v1/stock/positions/{$projectId}/{$materialId}";
    }

    protected function stockMovementsEndpoint(string $projectId, string $materialId): string
    {
        return "/api/v1/stock/positions/{$projectId}/{$materialId}/movements";
    }
}
