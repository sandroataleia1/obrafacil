<?php

namespace App\Models;

use App\Enums\ProjectStatus;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * PROJECT-API-01. A Project (Obra) is an operational hub, not a historical
 * document — its `customer()` relation is LIVE (§18): unlike Budget's
 * `customer_name` snapshot, renaming a Customer is reflected here
 * immediately. Deliberately has NO relation back to Budget/ServiceOrder —
 * `source_budget_id` is the only, unilateral link, and Budget itself gets
 * no `project()`/`projects()` relation at all (see ADR-011/ADR-013 and
 * this gate's own structural test).
 */
#[Fillable([
    'number', 'name', 'reference', 'status',
    'customer_id', 'customer_address_id',
    'address_postal_code', 'address_street', 'address_number', 'address_complement',
    'address_neighborhood', 'address_city', 'address_state', 'address_reference_point',
    'expected_start_date', 'expected_end_date',
    'source_budget_id',
])]
class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'status' => ProjectStatus::Planning->value,
    ];

    protected function casts(): array
    {
        return [
            'status' => ProjectStatus::class,
            'expected_start_date' => 'date:Y-m-d',
            'expected_end_date' => 'date:Y-m-d',
        ];
    }

    public function customer(): BelongsTo
    {
        // §18: Customer is soft-deleted, never hard-deleted (restrictOnDelete
        // on customer_id never fires for a soft delete) — withTrashed()
        // keeps this live relation resolvable even if the Customer was
        // later soft-deleted, instead of silently returning null.
        return $this->belongsTo(Customer::class)->withTrashed();
    }

    public function customerAddress(): BelongsTo
    {
        return $this->belongsTo(CustomerAddress::class);
    }

    public function sourceBudget(): BelongsTo
    {
        return $this->belongsTo(Budget::class, 'source_budget_id');
    }

    /**
     * The human-facing number, e.g. `OBR-000001`.
     */
    public function formattedNumber(): string
    {
        return sprintf('OBR-%06d', $this->number);
    }
}
