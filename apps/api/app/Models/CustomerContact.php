<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\CustomerContactFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['name', 'role', 'department', 'phone', 'whatsapp', 'email', 'notes', 'is_primary', 'active'])]
class CustomerContact extends Model
{
    /** @use HasFactory<CustomerContactFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'active' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
