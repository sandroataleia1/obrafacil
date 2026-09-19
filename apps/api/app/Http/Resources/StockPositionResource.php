<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01E §59. Wraps a plain row (stdClass/array) produced by
 * App\Stock\StockPositionService — NOT an Eloquent model, since a
 * StockPosition has no table (§49). All quantities are decimal strings
 * scale 3, or `null` exactly where §52/§58 call for "não planejado" to
 * stay distinct from "zero".
 */
class StockPositionResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $row = $this->resource;

        return [
            'project' => [
                'id' => $row->project_id,
                'number' => $row->project_number,
                'name' => $row->project_name,
            ],
            'material' => [
                'id' => $row->material_id,
                'name' => $row->material_name,
                'unit_code' => $row->material_unit_code,
                'unit_custom_label' => $row->material_unit_custom_label,
                'active' => (bool) $row->material_active,
            ],
            'required_quantity' => $row->required_quantity,
            'purchased_quantity' => $row->purchased_quantity,
            'received_quantity' => $row->received_quantity,
            'consumed_quantity' => $row->consumed_quantity,
            'stock_quantity' => $row->stock_quantity,
            'pending_receipt_quantity' => $row->pending_receipt_quantity,
            'missing_to_purchase_quantity' => $row->missing_to_purchase_quantity,
            'total_in' => $row->total_in,
            'total_out' => $row->total_out,
        ];
    }
}
