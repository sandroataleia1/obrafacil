<?php

namespace App\Http\Resources;

use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /api/v1/materials — SUPPLY-API-01A §10. A lean row per Material:
 * never `notes`/`created_at` (list rows don't need them), never
 * `company_id` (§10 — internal only).
 *
 * @property Material $resource
 */
class MaterialListResource extends JsonResource
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
            'active' => $this->active,
            'updated_at' => $this->updated_at,
        ];
    }
}
