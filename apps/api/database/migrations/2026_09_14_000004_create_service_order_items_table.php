<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-06 §19-26/§66. A line item is a snapshot of the CatalogItem it
 * was added from (`type`/`code`/`name`/`unit`/`description`) at selection
 * time — `catalog_item_id` is `nullOnDelete()` so losing the live catalog
 * row (even though there is no delete route for it today) never loses the
 * line's own historical data. `service_order_id` cascades — an item has no
 * meaning without its ServiceOrder.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('service_order_id')->constrained('service_orders')->cascadeOnDelete();
            $table->foreignUuid('catalog_item_id')->nullable()->constrained('catalog_items')->nullOnDelete();

            $table->string('type');
            $table->string('code')->nullable();
            $table->string('name');
            $table->string('unit');
            $table->text('description')->nullable();

            $table->decimal('quantity', 14, 3);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('line_discount', 14, 2)->default('0.00');
            $table->decimal('line_total', 14, 2);

            $table->text('notes')->nullable();
            $table->integer('sort_order')->default(0);

            $table->timestamps();

            $table->index(['company_id', 'service_order_id']);
        });

        DB::statement(
            'ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_type_check '.
            "CHECK (type IN ('product', 'service'))"
        );
        DB::statement(
            'ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_quantity_check CHECK (quantity > 0)'
        );
        DB::statement(
            'ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_unit_price_check CHECK (unit_price >= 0)'
        );
        DB::statement(
            'ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_line_discount_check CHECK (line_discount >= 0)'
        );
        DB::statement(
            'ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_line_total_check CHECK (line_total >= 0)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_line_total_check');
        DB::statement('ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_line_discount_check');
        DB::statement('ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_unit_price_check');
        DB::statement('ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_quantity_check');
        DB::statement('ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_type_check');

        Schema::dropIfExists('service_order_items');
    }
};
