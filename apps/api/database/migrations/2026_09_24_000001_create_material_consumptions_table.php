<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01E §6-7. MaterialConsumption is an immutable physical event
 * (create/delete only, never update — §7). No FIFO/lot reference (§43):
 * balance is always Project + Material aggregate, never tied to a specific
 * GoodsReceipt. `project_id`/`material_id` are `restrictOnDelete()`,
 * matching `material_requirements`/`purchase_order_items` (ADR-010/ADR-017).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('material_consumptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('project_id')->constrained('projects')->restrictOnDelete();
            $table->foreignUuid('material_id')->constrained('materials')->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->date('consumed_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'project_id', 'material_id']);
            $table->index(['company_id', 'consumed_at']);
        });

        DB::statement('ALTER TABLE material_consumptions ADD CONSTRAINT material_consumptions_quantity_positive_check CHECK (quantity > 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE material_consumptions DROP CONSTRAINT IF EXISTS material_consumptions_quantity_positive_check');

        Schema::dropIfExists('material_consumptions');
    }
};
