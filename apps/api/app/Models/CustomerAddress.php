<?php

namespace App\Models;

use App\Enums\CustomerAddressType;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\CustomerAddressFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'label', 'type', 'postal_code', 'street', 'number', 'complement',
    'neighborhood', 'city', 'state', 'reference_point', 'is_primary',
])]
class CustomerAddress extends Model
{
    /** @use HasFactory<CustomerAddressFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'type' => CustomerAddressType::class,
            'is_primary' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
