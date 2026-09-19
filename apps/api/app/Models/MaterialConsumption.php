<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\MaterialConsumptionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SUPPLY-API-01E §7. An immutable physical event — create/delete only,
 * never update. No FIFO/lot reference (§43): balance is always a
 * Project + Material aggregate, never tied to a specific GoodsReceipt.
 */
#[Fillable(['project_id', 'material_id', 'quantity', 'consumed_at', 'notes'])]
class MaterialConsumption extends Model
{
    /** @use HasFactory<MaterialConsumptionFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'consumed_at' => 'date:Y-m-d',
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
