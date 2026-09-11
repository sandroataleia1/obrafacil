<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-05 §4-16/§39-40. The commercial catalog of Products/Services —
 * see ADR-010 for why this is a distinct domain from Materials/Stock.
 * `company_id` is `restrictOnDelete()` (same policy as `customers`, §39).
 * No `deleted_at` — this gate deliberately has no DELETE route (§18); the
 * only "removal" is `active=false`, so the row is never soft- or
 * hard-deleted through the app.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->string('type');
            $table->string('code')->nullable();
            $table->string('name');
            $table->string('category')->nullable();
            $table->string('unit');
            $table->text('description')->nullable();
            $table->decimal('cost_price', 14, 2)->nullable();
            $table->decimal('sale_price', 14, 2)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'active', 'name']);
        });

        // §5/§29: mirrors the enum at the database level, same style as
        // customers_document_format_check — the app is still the primary
        // authority (Rule::enum in the FormRequest), this is the backstop.
        DB::statement(
            'ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_type_check '.
            "CHECK (type IN ('product', 'service'))"
        );

        // §13/§14/§40: prices are never negative. Nullable is allowed —
        // the CHECK only fires when a value is actually present.
        DB::statement(
            'ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_cost_price_check '.
            'CHECK (cost_price IS NULL OR cost_price >= 0)'
        );
        DB::statement(
            'ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_sale_price_check '.
            'CHECK (sale_price IS NULL OR sale_price >= 0)'
        );

        // §8: a case-insensitive partial unique index — only enforced when
        // `code` is actually set, and deliberately still reserves the code
        // of an `active=false` item (§8: "o índice deve continuar
        // considerando itens active=false") — there is no `active = true`
        // clause here, on purpose.
        DB::statement(
            'CREATE UNIQUE INDEX catalog_items_company_code_unique ON catalog_items (company_id, LOWER(code)) '.
            'WHERE code IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS catalog_items_company_code_unique');
        DB::statement('ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_sale_price_check');
        DB::statement('ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_cost_price_check');
        DB::statement('ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_type_check');

        Schema::dropIfExists('catalog_items');
    }
};
