<?php

namespace App\Http\Resources;

use App\Models\PurchaseOrder;
use App\Purchases\PurchaseOrderCalculator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01C §58/§69-70. ZERO `company_id`. `supplier`/`project` are
 * live relations — a rename shows up here immediately, never a frozen
 * snapshot (ADR-017 #10). `total` is always computed, never persisted.
 *
 * SUPPLY-API-01D §31/§62. `fulfillment_status` is derived (App\Purchases\
 * PurchaseOrderFulfillmentService — the controller MUST have already
 * called `attachToOrders()`/`computeAndAttach()` on this Order before
 * wrapping it here). `goods_receipts` is the full, chronologically
 * ordered (§33) physical history — eager-loaded by the controller
 * (`goodsReceipts.items`), never a per-Resource query (§34).
 *
 * @mixin PurchaseOrder
 */
class PurchaseOrderResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $lineTotals = $this->items->map(
            fn ($item) => PurchaseOrderCalculator::lineTotal((string) $item->quantity, (string) $item->unit_price)
        );

        return [
            'id' => $this->id,
            'number' => $this->formattedNumber(),
            'commercial_status' => $this->commercial_status->value,
            'fulfillment_status' => $this->fulfillmentStatus,
            'supplier' => [
                'id' => $this->supplier->id,
                'name' => $this->supplier->name,
                'active' => $this->supplier->active,
            ],
            'project' => [
                'id' => $this->project->id,
                'number' => $this->project->formattedNumber(),
                'name' => $this->project->name,
            ],
            'order_date' => $this->order_date?->format('Y-m-d'),
            'expected_delivery_date' => $this->expected_delivery_date?->format('Y-m-d'),
            'notes' => $this->notes,
            'items' => PurchaseOrderItemResource::collection($this->items),
            'goods_receipts' => GoodsReceiptResource::collection($this->goodsReceipts),
            'total' => PurchaseOrderCalculator::total($lineTotals),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
