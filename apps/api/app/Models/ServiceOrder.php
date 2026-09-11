<?php

namespace App\Models;

use App\Enums\ServiceOrderStatus;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\ServiceOrderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * BACKEND-06 §2. Deliberately has NO relation to Project — a ServiceOrder
 * is an attendance/service executed for a Customer, independent of any
 * Obra. See ADR-011.
 */
#[Fillable([
    'number', 'status',
    'customer_id', 'customer_address_id', 'customer_contact_id', 'responsible_user_id',
    'title', 'description',
    'customer_name', 'customer_document', 'customer_phone', 'customer_email',
    'execution_address_label', 'execution_address_type', 'execution_postal_code',
    'execution_street', 'execution_number', 'execution_complement', 'execution_neighborhood',
    'execution_city', 'execution_state', 'execution_reference_point',
    'contact_name', 'contact_role', 'contact_department', 'contact_phone', 'contact_whatsapp', 'contact_email',
    'scheduled_start_at', 'scheduled_end_at',
    'started_at', 'completed_at', 'cancelled_at', 'cancellation_reason',
    'subtotal', 'order_discount', 'travel_fee', 'total',
    'notes', 'created_by_user_id',
])]
class ServiceOrder extends Model
{
    /** @use HasFactory<ServiceOrderFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'status' => ServiceOrderStatus::Open->value,
        'subtotal' => '0.00',
        'order_discount' => '0.00',
        'travel_fee' => '0.00',
        'total' => '0.00',
    ];

    protected function casts(): array
    {
        return [
            'status' => ServiceOrderStatus::class,
            'subtotal' => 'decimal:2',
            'order_discount' => 'decimal:2',
            'travel_fee' => 'decimal:2',
            'total' => 'decimal:2',
            'scheduled_start_at' => 'datetime',
            'scheduled_end_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function customerAddress(): BelongsTo
    {
        return $this->belongsTo(CustomerAddress::class);
    }

    public function customerContact(): BelongsTo
    {
        return $this->belongsTo(CustomerContact::class);
    }

    public function responsibleUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_user_id');
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ServiceOrderItem::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * §13/§15: the human-facing number, e.g. `OS-000001`.
     */
    public function formattedNumber(): string
    {
        return sprintf('OS-%06d', $this->number);
    }
}
