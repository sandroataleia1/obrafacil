<?php

namespace App\Models;

use App\Enums\BudgetItemSourceType;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\BudgetItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'budget_id', 'catalog_item_id',
    'source_type', 'type', 'calculator_type', 'code', 'name', 'unit', 'description',
    'quantity', 'unit_price', 'unit_cost', 'line_discount', 'line_total', 'line_cost_total',
    'calculation_snapshot', 'notes', 'sort_order',
])]
class BudgetItem extends Model
{
    /** @use HasFactory<BudgetItemFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'source_type' => BudgetItemSourceType::class,
            'quantity' => 'decimal:3',
            'unit_price' => 'decimal:2',
            'unit_cost' => 'decimal:2',
            'line_discount' => 'decimal:2',
            'line_total' => 'decimal:2',
            'line_cost_total' => 'decimal:2',
            'calculation_snapshot' => 'array',
        ];
    }

    public function budget(): BelongsTo
    {
        return $this->belongsTo(Budget::class);
    }

    public function catalogItem(): BelongsTo
    {
        return $this->belongsTo(CatalogItem::class);
    }
}
