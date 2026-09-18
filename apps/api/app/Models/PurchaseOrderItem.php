<?php

namespace App\Models;

use App\Enums\MaterialUnitCode;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\PurchaseOrderItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SUPPLY-API-01C §4/§8/§71. `unit_code`/`unit_custom_label` are a
 * server-side snapshot of the Material's unit taken once at creation —
 * never re-synced, which is exactly why an existing row blocks the
 * Material's own unit from changing. `description` is a separate,
 * freely-editable commercial snapshot — `material()` stays a LIVE
 * relation on the Resource, deliberately diverging from `description`
 * over time (§71). No `line_total` — always computed via
 * App\Purchases\PurchaseOrderCalculator, never persisted.
 */
#[Fillable(['purchase_order_id', 'material_id', 'description', 'unit_code', 'unit_custom_label', 'quantity', 'unit_price'])]
class PurchaseOrderItem extends Model
{
    /** @use HasFactory<PurchaseOrderItemFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'unit_code' => MaterialUnitCode::class,
            'quantity' => 'decimal:3',
            'unit_price' => 'decimal:2',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(Material::class);
    }
}
