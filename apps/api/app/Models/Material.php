<?php

namespace App\Models;

use App\Enums\MaterialUnitCode;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\MaterialFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The operational Material catalog a Company consumes on its Obras —
 * entirely separate from CatalogItem (ADR-010/ADR-017 #1). Company-wide,
 * never Obra-scoped (ADR-017 #2). No relations to MaterialRequirement/
 * PurchaseOrderItem/MaterialConsumption/StockAdjustment are declared
 * here yet — those tables don't exist until later gates (SUPPLY-API-01B/
 * 01C/01E); a relation to a nonexistent table would be fictional.
 */
#[Fillable(['name', 'unit_code', 'unit_custom_label', 'notes', 'active'])]
class Material extends Model
{
    /** @use HasFactory<MaterialFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'unit_code' => MaterialUnitCode::class,
            'active' => 'boolean',
        ];
    }
}
