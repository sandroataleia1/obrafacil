<?php

namespace App\Models;

use App\Enums\CustomerKind;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['kind', 'name', 'legal_name', 'trade_name', 'document', 'phone', 'email', 'notes', 'active'])]
class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use BelongsToCompany, HasFactory, HasUuids, SoftDeletes;

    protected $attributes = [
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'kind' => CustomerKind::class,
            'active' => 'boolean',
        ];
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(CustomerContact::class);
    }
}
