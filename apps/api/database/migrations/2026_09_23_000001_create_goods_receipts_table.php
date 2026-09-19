<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01D §1-4. `GoodsReceipt` is the PHYSICAL fact of materials
 * arriving — deliberately separate from the commercial fact
 * (`PurchaseOrder`) and any future financial fact (`Payable`). v1 is an
 * IMMUTABLE event: create + delete only, no PUT/PATCH (§2) — a wrong
 * entry is deleted and re-registered, never edited in place. No human
 * number (§3) — identified by `received_at`/chronological order, matching
 * the frontend prototype's own contract.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('purchase_order_id')->constrained('purchase_orders')->restrictOnDelete();
            $table->date('received_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'purchase_order_id']);
            $table->index(['company_id', 'received_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_receipts');
    }
};
