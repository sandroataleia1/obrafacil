<?php

namespace App\Models;

use App\Enums\BudgetDecisionSource;
use App\Enums\BudgetStatus;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\BudgetFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * BUDGET-API-01. Deliberately has NO relation to Project — a Budget is a
 * commercial quote for a Customer, independent of any Obra (same
 * discipline as ServiceOrder/ADR-011).
 */
#[Fillable([
    'number', 'status',
    'customer_id', 'title', 'reference', 'notes',
    'customer_name', 'customer_document', 'customer_phone', 'customer_email',
    'sale_subtotal', 'cost_subtotal', 'margin_amount', 'margin_percentage', 'discount_amount', 'total',
    'proposal_token', 'submitted_at',
    'decision_source', 'decision_by_user_id', 'decision_by_name', 'decision_note', 'decided_at',
    'created_by_user_id',
])]
class Budget extends Model
{
    /** @use HasFactory<BudgetFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'status' => BudgetStatus::Draft->value,
        'sale_subtotal' => '0.00',
        'discount_amount' => '0.00',
        'total' => '0.00',
    ];

    protected function casts(): array
    {
        return [
            'status' => BudgetStatus::class,
            'decision_source' => BudgetDecisionSource::class,
            'sale_subtotal' => 'decimal:2',
            'cost_subtotal' => 'decimal:2',
            'margin_amount' => 'decimal:2',
            'margin_percentage' => 'decimal:4',
            'discount_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function decisionByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decision_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(BudgetItem::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * The human-facing number, e.g. `ORC-000001`.
     */
    public function formattedNumber(): string
    {
        return sprintf('ORC-%06d', $this->number);
    }
}
