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
 * `source_type=calculator`, prohibited otherwise (enforced by a real
 * Postgres CHECK, not just the FormRequest — BUDGET-API-01A §22).
 * `calculation_snapshot` follows the same discipline (§21): required
 * (non-NULL) exactly when `source_type=calculator`, forbidden otherwise
 * — a calculator-sourced line is meaningless without the audit trail of
 * what produced its quantity/cost.
 *
 * `unit` is nullable (§14) — a closed-price line (a calculator result or
 * a manual lump sum) has no natural unit of measure to force.
 *
 * `unit_cost`/`line_cost_total` are nullable — when null, the WHOLE
 * Budget's `cost_subtotal`/`margin_amount` become null (never silently
 * treated as 0), see App\Budgets\BudgetCalculator. `unit_cost` is a
 * creation-time-only snapshot (§2/§3, BUDGET-API-01A): set once when the
 * item is inserted (from `CatalogItem.cost_price` for `catalog`, from
 * the payload for `calculator`/`manual`) and never mutable via `PUT`
 * afterwards — changing historical cost without updating
 * `calculation_snapshot` would break auditability. `line_discount`
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
            $table->string('unit')->nullable();
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
        // §22 hardening: calculator_type isn't just "valid when present" —
        // it's required exactly when source_type=calculator and forbidden
        // otherwise, enforced at the database level, not just the
        // FormRequest.
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_calculator_type_check '.
            "CHECK ((source_type = 'calculator' AND calculator_type IN ('masonry', 'floor', 'ceiling', 'slab')) ".
            "OR (source_type != 'calculator' AND calculator_type IS NULL))"
        );
        // §21 hardening: a calculator-sourced item is meaningless without
        // its audit snapshot; a catalog/manual item must never carry one.
        DB::statement(
            'ALTER TABLE budget_items ADD CONSTRAINT budget_items_calculation_snapshot_check '.
            "CHECK ((source_type = 'calculator' AND calculation_snapshot IS NOT NULL) ".
            "OR (source_type != 'calculator' AND calculation_snapshot IS NULL))"
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
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_calculation_snapshot_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_calculator_type_check');
        DB::statement('ALTER TABLE budget_items DROP CONSTRAINT IF EXISTS budget_items_source_type_check');

        Schema::dropIfExists('budget_items');
    }
};
