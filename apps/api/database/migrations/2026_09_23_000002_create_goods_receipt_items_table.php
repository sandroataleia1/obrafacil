<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01D §5-7. A `GoodsReceiptItem` carries ONLY a quantity and a
 * reference to its `PurchaseOrderItem` — no `material_id`/description/
 * unit snapshot of its own. `PurchaseOrderItem` already preserves the
 * commercial description and unit snapshot; duplicating them here would
 * create a second, divergence-prone copy for no reason. Both FKs are
 * `restrictOnDelete()` — a `PurchaseOrderItem` with any receipt becomes
 * non-deletable (§7/§40), and this table itself is only ever emptied
 * explicitly by `GoodsReceiptService::delete()` (§24), never a cascade.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goods_receipt_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('goods_receipt_id')->constrained('goods_receipts')->restrictOnDelete();
            $table->foreignUuid('purchase_order_item_id')->constrained('purchase_order_items')->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->timestamps();

            $table->unique(['goods_receipt_id', 'purchase_order_item_id'], 'goods_receipt_items_receipt_order_item_unique');
            $table->index(['company_id', 'purchase_order_item_id']);
        });

        // §6: application validates first (StoreGoodsReceiptRequest/GoodsReceiptService); this CHECK is the backstop.
        DB::statement('ALTER TABLE goods_receipt_items ADD CONSTRAINT goods_receipt_items_quantity_positive_check CHECK (quantity > 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE goods_receipt_items DROP CONSTRAINT IF EXISTS goods_receipt_items_quantity_positive_check');

        Schema::dropIfExists('goods_receipt_items');
    }
};
