<?php

namespace App\Http\Resources;

use App\Models\GoodsReceipt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01D §32. ZERO `company_id`. No `updated_at` — GoodsReceipt is
 * an immutable event (§2), so there is nothing to version.
 *
 * @mixin GoodsReceipt
 */
class GoodsReceiptResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'received_at' => $this->received_at?->format('Y-m-d'),
            'notes' => $this->notes,
            'items' => GoodsReceiptItemResource::collection($this->items),
            'created_at' => $this->created_at,
        ];
    }
}
