<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01E §44-48. StockMovement is a pure read model, never a
 * table — a union of GoodsReceiptItem/MaterialConsumption/StockAdjustment
 * rows attached by App\Http\Controllers\Api\V1\StockPositionController
 * with the shared `project_id`/`material` context before reaching this
 * Resource. `quantity` is always a positive magnitude (§45).
 */
class StockMovementResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $row = $this->resource;

        return [
            'id' => $row->movement_id,
            'project_id' => $row->project_id,
            'material' => $row->material,
            'type' => $row->type,
            'quantity' => (string) $row->quantity,
            'occurred_at' => $row->occurred_at instanceof \DateTimeInterface ? $row->occurred_at->format('Y-m-d') : (string) $row->occurred_at,
            'source_type' => $row->source_type,
            'source_id' => $row->source_id,
            'note' => $row->note,
        ];
    }
}
