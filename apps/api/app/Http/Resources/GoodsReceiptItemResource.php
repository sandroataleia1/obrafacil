<?php

namespace App\Http\Resources;

use App\Models\GoodsReceiptItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01D §32. Minimal shape — no description/unit/Material
 * duplication here; those live on the referenced PurchaseOrderItem, which
 * the frontend cross-references via `purchase_order_item_id`.
 *
 * @mixin GoodsReceiptItem
 */
class GoodsReceiptItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'purchase_order_item_id' => $this->purchase_order_item_id,
            'quantity' => (string) $this->quantity,
        ];
    }
}
