<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01E §17-20. StockAdjustment is append-only for its entire
 * lifetime (§20) — CREATE only, no PUT/PATCH/DELETE route exists at any
 * layer. Direction comes exclusively from `type`; `quantity` is always
 * stored positive (§19 CHECK).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('project_id')->constrained('projects')->restrictOnDelete();
            $table->foreignUuid('material_id')->constrained('materials')->restrictOnDelete();
            $table->string('type');
            $table->decimal('quantity', 14, 3);
            $table->date('occurred_at');
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'project_id', 'material_id']);
            $table->index(['company_id', 'occurred_at']);
        });

        DB::statement('ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_quantity_positive_check CHECK (quantity > 0)');
        DB::statement(
            'ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_type_check '.
            "CHECK (type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_type_check');
        DB::statement('ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_quantity_positive_check');

        Schema::dropIfExists('stock_adjustments');
    }
};
