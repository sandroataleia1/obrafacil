<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01C §1/§3. `PurchaseOrder` is the commercial layer only — no
 * `fulfillment_status`/`received_quantity`/`payable_id`/`project_cost_id`/
 * persisted `total`, and no `supplier_name`/`project_name` snapshot
 * (`supplier()`/`project()` stay LIVE relations, ADR-017 #10). `number` is
 * allocated by `PurchaseOrderNumberAllocator` inside the create
 * transaction — `PC-000001` is a Resource-layer formatting of the raw
 * integer, never persisted as a string.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('number');
            $table->foreignUuid('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->foreignUuid('project_id')->constrained('projects')->restrictOnDelete();
            $table->date('order_date');
            $table->date('expected_delivery_date')->nullable();
            $table->string('commercial_status');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'number']);
            $table->index(['company_id', 'commercial_status']);
            $table->index(['company_id', 'project_id']);
            $table->index(['company_id', 'supplier_id']);
            $table->index(['company_id', 'updated_at']);
        });

        DB::statement(
            'ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_commercial_status_check '.
            "CHECK (commercial_status IN ('draft', 'ordered', 'cancelled'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_commercial_status_check');

        Schema::dropIfExists('purchase_orders');
    }
};
