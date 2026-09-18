<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\MaterialRequirementFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SUPPLY-API-01B §1/§6/§33-35. Deliberately carries no snapshot of the
 * Material's unit or name, nor the Project's name — `project()`/
 * `material()` are LIVE relations, so renaming either is reflected here
 * immediately. This is precisely why Material's unit/delete are guarded
 * while a Requirement exists (see App\Materials\MaterialService).
 */
#[Fillable(['project_id', 'material_id', 'required_quantity', 'notes'])]
class MaterialRequirement extends Model
{
    /** @use HasFactory<MaterialRequirementFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'required_quantity' => 'decimal:3',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(Material::class);
    }
}
