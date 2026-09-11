<?php

namespace App\Models;

use App\Enums\CatalogItemType;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\CatalogItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * The commercial catalog of Products/Services a company offers — entirely
 * separate from Materials/Stock (see ADR-010). Never deleted through the
 * app: `active=false` is the only "removal" — BudgetItem/ServiceOrderItem
 * will reference this historically, so the row must always still exist.
 *
 * `cost_price`/`sale_price` cast as `decimal:2`, which Laravel returns as
 * a string (never a binary float) — safe to hand straight to a Resource.
 */
#[Fillable(['type', 'code', 'name', 'category', 'unit', 'description', 'cost_price', 'sale_price', 'active'])]
class CatalogItem extends Model
{
    /** @use HasFactory<CatalogItemFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'type' => CatalogItemType::class,
            'cost_price' => 'decimal:2',
            'sale_price' => 'decimal:2',
            'active' => 'boolean',
        ];
    }
}
