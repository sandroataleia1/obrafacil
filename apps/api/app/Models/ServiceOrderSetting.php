<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\ServiceOrderSettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['default_travel_fee'])]
class ServiceOrderSetting extends Model
{
    /** @use HasFactory<ServiceOrderSettingFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'default_travel_fee' => '0.00',
    ];

    protected function casts(): array
    {
        return [
            'default_travel_fee' => 'decimal:2',
        ];
    }
}
