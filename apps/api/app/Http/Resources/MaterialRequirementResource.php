<?php

namespace App\Http\Resources;

use App\Models\MaterialRequirement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * SUPPLY-API-01B §16. ZERO `company_id`. `material` is the live relation
 * (§34) — never a snapshot — so a Material rename/reactivation shows up
 * here immediately. No `ordered`/`received`/`consumed`/`available` — those
 * are relations/derivations that don't exist yet (§39/ADR-017).
 *
 * @mixin MaterialRequirement
 */
class MaterialRequirementResource extends JsonResource
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
            'required_quantity' => (string) $this->required_quantity,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
