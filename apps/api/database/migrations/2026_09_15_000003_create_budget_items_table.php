<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BUDGET-API-01. A line item is either a snapshot of a CatalogItem
 * (`source_type=catalog`), a frozen result of a frontend calculator
 * (`source_type=calculator`, optionally carrying `calculation_snapshot`
 * for audit), or fully manual (`source_type=manual`). `catalog_item_id` is
 * `nullOnDelete()` so losing the live catalog row never loses the line's
 * own historical data. `budget_id` cascades — an item has no meaning
 * without its Budget.
 *
 * `type` mirrors `service_order_items.type` — a snapshot of the
 * CatalogItem's `product`/`service` type at selection time, `null` for
 * `calculator`/`manual` sources. `calculator_type` identifies which of
 * the four frontend calculators (masonry/floor/ceiling/slab) produced a
 * `source_type=calculator` item — required exactly when
 * `source_type=calculator`, prohibited otherwise.
 *
 * `unit_cost`/`line_cost_total` are nullable — when null, the WHOLE
 * Budget's `cost_subtotal`/`margin_amount` become null (never silently
 * treated as 0), see App\Budgets\BudgetCalculator. `line_discount`
 * mirrors `service_order_items.line_discount` exactly: gross_sale =
 * round(quantity × unit_price, 2); line_total = gross_sale -
 * line_discount. Never negative, and never larger than the line's own
 * gross_sale (enforced in App\Budgets\BudgetItemService, mirroring
 * ServiceOrderItemService::assertDiscountWithinGross()).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budget_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('budget_id')->constrained('budgets')->cascadeOnDelete();
            $table->foreignUuid('catalog_item_id')->nullable()->constrained('catalog_items')->nullOnDelete();

            $table->string('source_type');
            $table->string('type')->nullable();
            $table->string('calculator_type')->nullable();
            $table->string('code')->nullable();
            $table->string('name');
            $table->string('unit');
            $table->text('description')->nullable();

            $table->decimal('quantity', 14, 3);
            $table->decimal('unit_price', 14, 2);
            $table->decimal('unit_cost', 14, 2)->nullable();
            $table->decimal('line_discount', 14, 2)->default('0.00');
            $table->decimal('line_total', 14, 2);
            $table->decimal('line_cost_total', 14, 2)->nullable();

            $table->jsonb('calculation_snapshot')->nullable();

            $table->text('notes')->nullable();
            $table->integer('sort_order')->default(0);

            $table->timestamps();

            $table->index(['company_id', 'budget_id']);
        });

        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_source_type_check '.
            "CHECK (source_type IN ('catalog', 'calculator', 'manual'))"
        );
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_calculator_type_check '.
            "CHECK (calculator_type IS NULL OR calculator_type IN ('masonry', 'floor', 'ceiling', 'slab'))"
        );
        DB::statement('ALTER TABLE budget_items ADD CONSTRAINT budget_items_quantity_check CHECK (quantity > 0)');
        DB::statement('ALTER TABLE budget_items ADD CONSTRAINT budget_items_unit_price_check CHECK (unit_price >= 0)');
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_unit_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0)'
        );
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_line_discount_check CHECK (line_discount >= 0)'
        );
        DB::statement('ALTER TABLE budget_items ADD CONSTRAINT budget_items_line_total_check CHECK (line_total >= 0)');
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_line_cost_total_check '.
            'CHECK (line_cost_total IS NULL OR line_cost_total >= 0)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_line_cost_total_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_line_total_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_line_discount_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_unit_cost_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_unit_price_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_quantity_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_calculator_type_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_source_type_check');

        Schema::dropIfExists('budget_items');
    }
};
