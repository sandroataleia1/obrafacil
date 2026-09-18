<?php

namespace App\Http\Resources;

use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET/POST/PUT /api/v1/materials/{material} — SUPPLY-API-01A §10. The
 * detail shape (list + `notes`/`created_at`). `company_id` never exposed.
 * No `stock`/`price`/`supplier`/`required_quantity`/`ordered_quantity`/
 * `received_quantity`/`consumed_quantity` — none of those domains exist
 * yet, and even once they do, this Resource stays scoped to Material's
 * own fields only (mirrors ADR-016 #6's discipline for Project).
 *
 * @property Material $resource
 */
class MaterialResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'unit_code' => $this->unit_code->value,
            'unit_custom_label' => $this->unit_custom_label,
            'notes' => $this->notes,
            'active' => $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
