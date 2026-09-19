<?php

namespace App\Http\Resources;

use App\Models\StockAdjustment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01E §27. ZERO `company_id`. No `updated_at` — append-only,
 * nothing to version.
 *
 * @mixin StockAdjustment
 */
class StockAdjustmentResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'material' => [
                'id' => $this->material->id,
                'name' => $this->material->name,
                'unit_code' => $this->material->unit_code->value,
                'unit_custom_label' => $this->material->unit_custom_label,
                'active' => $this->material->active,
            ],
            'type' => $this->type->value,
            'quantity' => (string) $this->quantity,
            'occurred_at' => $this->occurred_at?->format('Y-m-d'),
            'reason' => $this->reason,
            'created_at' => $this->created_at,
        ];
    }
}
