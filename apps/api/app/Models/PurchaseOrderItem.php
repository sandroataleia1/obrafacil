<?php

namespace App\Models;

use App\Enums\MaterialUnitCode;
use App\Models\Concerns\BelongsToCompany;
use App\Purchases\PurchaseOrderVersionClock;
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

    /** SUPPLY-API-01C1 §11-13/§16: its own updated_at is the item's optimistic-concurrency version. */
    protected $dateFormat = 'Y-m-d H:i:s.u';

    /**
     * SUPPLY-API-01D §62. A real PHP property, NOT an Eloquent attribute
     * — see PurchaseOrder::$fulfillmentStatus for the full rationale.
     *
     * @var array{received_quantity: string, remaining_quantity: string, fulfillment_status: string}|null
     */
    public ?array $fulfillment = null;

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

    /**
     * SUPPLY-API-01C1 §14/§16-17. Same monotonic-version override as
     * PurchaseOrder — see its own docblock for the full rationale.
     */
    public function updateTimestamps()
    {
        $updatedAtColumn = $this->getUpdatedAtColumn();

        if (! is_null($updatedAtColumn) && ! $this->isDirty($updatedAtColumn)) {
            $current = $this->exists ? $this->{$updatedAtColumn} : null;
            $this->setUpdatedAt(PurchaseOrderVersionClock::nextVersion($current));
        }

        $createdAtColumn = $this->getCreatedAtColumn();

        if (! $this->exists && ! is_null($createdAtColumn) && ! $this->isDirty($createdAtColumn)) {
            $this->setCreatedAt($this->freshTimestamp());
        }

        return $this;
    }
}
