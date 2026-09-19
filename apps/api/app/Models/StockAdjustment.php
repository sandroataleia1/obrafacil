<?php

namespace App\Models;

use App\Enums\StockAdjustmentType;
use App\Models\Concerns\BelongsToCompany;
use Database\Factories\StockAdjustmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SUPPLY-API-01E §20. Append-only for its entire lifetime — create only,
 * no update/delete route exists at any layer. Correcting a wrong
 * adjustment means registering a new, explicit inverse adjustment.
 */
#[Fillable(['project_id', 'material_id', 'type', 'quantity', 'occurred_at', 'reason'])]
class StockAdjustment extends Model
{
    /** @use HasFactory<StockAdjustmentFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'type' => StockAdjustmentType::class,
            'quantity' => 'decimal:3',
            'occurred_at' => 'date:Y-m-d',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function material(): BelongsTo
    {
        return $this->belongsTo(Material::class);
    }
}
