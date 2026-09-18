<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01C §4-8. `unit_code`/`unit_custom_label` are a server-side
 * snapshot of the Material's unit at the moment the item was added —
 * copied once, never re-synced, which is exactly why an existing item
 * blocks the Material's own unit from changing (App\Materials\MaterialService
 * ::hasDependents()). `description` is the freely-editable commercial
 * snapshot (§9) — Material.name stays a live relation on the Resource,
 * deliberately diverging from `description` over time (§71).
 *
 * `purchase_order_id` is `restrictOnDelete()`, NOT cascade (§5) —
 * PurchaseOrderService::deleteDraft() removes items explicitly inside its
 * own transaction; a raw DELETE on a historical (ordered/cancelled) Order
 * must never silently take its items with it.
 *
 * No `line_total`/`received_quantity`/`fulfillment` — line_total is always
 * computed (App\Purchases\PurchaseOrderCalculator), never persisted (§4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('purchase_order_id')->constrained('purchase_orders')->restrictOnDelete();
            $table->foreignUuid('material_id')->constrained('materials')->restrictOnDelete();
            $table->string('description');
            $table->string('unit_code');
            $table->string('unit_custom_label')->nullable();
            $table->decimal('quantity', 14, 3);
            $table->decimal('unit_price', 14, 2);
            $table->timestamps();

            $table->unique(['purchase_order_id', 'material_id'], 'purchase_order_items_order_material_unique');
            $table->index(['company_id', 'material_id']);
        });

        DB::statement('ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_quantity_positive_check CHECK (quantity > 0)');
        DB::statement('ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_unit_price_nonnegative_check CHECK (unit_price >= 0)');
        DB::statement(
            'ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_unit_code_check '.
            "CHECK (unit_code IN ('un', 'kg', 't', 'm', 'm2', 'm3', 'l', 'sc', 'cx', 'other'))"
        );
        DB::statement(
            'ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_unit_custom_label_check '.
            "CHECK ((unit_code = 'other' AND unit_custom_label IS NOT NULL AND btrim(unit_custom_label) <> '') ".
            "OR (unit_code <> 'other' AND unit_custom_label IS NULL))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_unit_custom_label_check');
        DB::statement('ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_unit_code_check');
        DB::statement('ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_unit_price_nonnegative_check');
        DB::statement('ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_quantity_positive_check');

        Schema::dropIfExists('purchase_order_items');
    }
};
