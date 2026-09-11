<?php

namespace App\Models;

use App\Enums\CatalogItemType;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\ServiceOrderItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * BACKEND-06 §20. Every field except `quantity`/`unit_price`/
 * `line_discount`/`notes`/`sort_order` is a snapshot of the CatalogItem at
 * the moment it was added — never re-derived from the (possibly since
 * changed or inactivated) live CatalogItem row.
 */
#[Fillable([
    'service_order_id', 'catalog_item_id',
    'type', 'code', 'name', 'unit', 'description',
    'quantity', 'unit_price', 'line_discount', 'line_total',
    'notes', 'sort_order',
])]
class ServiceOrderItem extends Model
{
    /** @use HasFactory<ServiceOrderItemFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'type' => CatalogItemType::class,
            'quantity' => 'decimal:3',
            'unit_price' => 'decimal:2',
            'line_discount' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class);
    }

    public function catalogItem(): BelongsTo
    {
        return $this->belongsTo(CatalogItem::class);
    }
}
