<?php

namespace App\Models;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Purchases\PurchaseOrderVersionClock;
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
 *
 * SUPPLY-API-01C1 §11-13: `updated_at` is the optimistic-concurrency
 * version for this aggregate, not just visual audit — `$dateFormat`
 * carries microseconds (the `purchase_orders`/`purchase_order_items`
 * columns were widened to `timestamp(6)`) so two mutations inside the
 * same wall-clock second still produce distinguishable versions. Even
 * with microsecond storage, `App\Purchases\PurchaseOrderVersionClock` is
 * what actually GUARANTEES strict advancement (§14) — this format change
 * alone only makes that guarantee observable/persistable.
 */
#[Fillable([
    'number', 'supplier_id', 'project_id', 'order_date', 'expected_delivery_date',
    'commercial_status', 'notes',
])]
class PurchaseOrder extends Model
{
    /** @use HasFactory<PurchaseOrderFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.u';

    /**
     * SUPPLY-API-01D §62. A real PHP property, NOT an Eloquent attribute
     * — assigning it goes straight to this declared property, bypassing
     * Model::__set()/setAttribute() entirely, so it is never marked
     * dirty and never written by save()/touch(). Populated by
     * App\Purchases\PurchaseOrderFulfillmentService::attachToOrders()
     * before a Resource reads it; never persisted, never accepted from a
     * request.
     */
    public ?string $fulfillmentStatus = null;

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
     * SUPPLY-API-01D §31/§33. The full physical (receipt) history,
     * ordered chronologically — received_at ASC, then created_at ASC,
     * then id ASC as a final deterministic tiebreak.
     */
    public function goodsReceipts(): HasMany
    {
        return $this->hasMany(GoodsReceipt::class)
            ->orderBy('received_at')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /**
     * The human-facing number, e.g. `PC-000001`.
     */
    public function formattedNumber(): string
    {
        return sprintf('PC-%06d', $this->number);
    }

    /**
     * SUPPLY-API-01C1 §14/§17. Overrides Eloquent's own hook so
     * `updated_at` always advances via PurchaseOrderVersionClock instead
     * of a plain `now()` — guarantees strict advancement even when two
     * mutations land in the same microsecond, or a test freezes the
     * clock. `created_at` is untouched (still plain freshTimestamp()).
     * Skips recomputation when the column is already dirty (e.g.
     * touch() already set it before calling save()), matching Eloquent's
     * own original guard exactly.
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
