<?php

namespace App\Models;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\PurchaseOrderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * SUPPLY-API-01C §1/§13/§69-70. The commercial layer — `supplier()`/
 * `project()` are LIVE relations, never a name snapshot (ADR-017 #10). No
 * persisted `total` — always computed via App\Purchases\PurchaseOrderCalculator.
 */
#[Fillable([
    'number', 'supplier_id', 'project_id', 'order_date', 'expected_delivery_date',
    'commercial_status', 'notes',
])]
class PurchaseOrder extends Model
{
    /** @use HasFactory<PurchaseOrderFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'commercial_status' => PurchaseOrderCommercialStatus::class,
            'order_date' => 'date:Y-m-d',
            'expected_delivery_date' => 'date:Y-m-d',
        ];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    /**
     * The human-facing number, e.g. `PC-000001`.
     */
    public function formattedNumber(): string
    {
        return sprintf('PC-%06d', $this->number);
    }
}
