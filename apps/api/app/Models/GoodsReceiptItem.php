<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\GoodsReceiptItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SUPPLY-API-01D §7. Carries ONLY `quantity` + a reference to its
 * `PurchaseOrderItem` — no material/description/unit snapshot of its own,
 * since `PurchaseOrderItem` already preserves that commercial snapshot.
 */
#[Fillable(['goods_receipt_id', 'purchase_order_item_id', 'quantity'])]
class GoodsReceiptItem extends Model
{
    /** @use HasFactory<GoodsReceiptItemFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
        ];
    }

    public function goodsReceipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class);
    }

    public function purchaseOrderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class);
    }
}
