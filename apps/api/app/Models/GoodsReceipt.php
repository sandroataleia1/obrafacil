<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\GoodsReceiptFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * SUPPLY-API-01D §1-3/§8. The PHYSICAL fact of materials arriving — an
 * immutable event (create/delete only, no update). No human number; the
 * frontend/UX identifies a receipt by `received_at` and chronological
 * order (§3/§33).
 */
#[Fillable(['purchase_order_id', 'received_at', 'notes'])]
class GoodsReceipt extends Model
{
    /** @use HasFactory<GoodsReceiptFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'received_at' => 'date:Y-m-d',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(GoodsReceiptItem::class);
    }
}
