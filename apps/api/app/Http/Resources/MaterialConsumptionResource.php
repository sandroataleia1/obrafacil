<?php

namespace App\Http\Resources;

use App\Models\MaterialConsumption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01E §15. ZERO `company_id`. No `updated_at` — an immutable
 * event, nothing to version.
 *
 * @mixin MaterialConsumption
 */
class MaterialConsumptionResource extends JsonResource
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
            'quantity' => (string) $this->quantity,
            'consumed_at' => $this->consumed_at?->format('Y-m-d'),
            'notes' => $this->notes,
            'created_at' => $this->created_at,
        ];
    }
}
