<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-06 §2-9/§64-66. A ServiceOrder is an attendance/service executed
 * for a Customer — deliberately independent of Project (no `project_id`
 * column at all, see ADR-011 and the structural "no project" tests). It
 * carries a full historical snapshot of the Customer/Address/Contact it
 * was created against (§4/§5/§7), so `customer_address_id`/
 * `customer_contact_id` are `nullOnDelete()` — losing the *live* row must
 * never lose the *historical* snapshot already copied onto this table.
 * `customer_id` stays `restrictOnDelete()` like every other tenant table:
 * Customer is soft-deleted, never hard-deleted, so the row always exists.
 * No `deleted_at` — a ServiceOrder is never deleted, only `cancelled`
 * (§12/§51).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();

            $table->unsignedBigInteger('number');
            $table->string('status');

            $table->foreignUuid('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignUuid('customer_address_id')->nullable()->constrained('customer_addresses')->nullOnDelete();
            $table->foreignUuid('customer_contact_id')->nullable()->constrained('customer_contacts')->nullOnDelete();
            $table->foreignUuid('responsible_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('title');
            $table->text('description')->nullable();

            // §4: Customer snapshot, copied server-side at creation time.
            $table->string('customer_name');
            $table->string('customer_document')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();

            // §5: CustomerAddress snapshot, copied server-side.
            $table->string('execution_address_label');
            $table->string('execution_address_type');
            $table->string('execution_postal_code')->nullable();
            $table->string('execution_street')->nullable();
            $table->string('execution_number')->nullable();
            $table->string('execution_complement')->nullable();
            $table->string('execution_neighborhood')->nullable();
            $table->string('execution_city')->nullable();
            $table->string('execution_state', 2)->nullable();
            $table->string('execution_reference_point')->nullable();

            // §7: CustomerContact snapshot, copied server-side (all null
            // when no contact was selected).
            $table->string('contact_name')->nullable();
            $table->string('contact_role')->nullable();
            $table->string('contact_department')->nullable();
            $table->string('contact_phone')->nullable();
            $table->string('contact_whatsapp')->nullable();
            $table->string('contact_email')->nullable();

            $table->timestampTz('scheduled_start_at')->nullable();
            $table->timestampTz('scheduled_end_at')->nullable();

            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('completed_at')->nullable();
            $table->timestampTz('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();

            $table->decimal('subtotal', 14, 2)->default('0.00');
            $table->decimal('order_discount', 14, 2)->default('0.00');
            $table->decimal('travel_fee', 14, 2)->default('0.00');
            $table->decimal('total', 14, 2)->default('0.00');

            $table->text('notes')->nullable();

            $table->foreignUuid('created_by_user_id')->constrained('users')->restrictOnDelete();

            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'customer_id']);
            $table->index(['company_id', 'created_at']);
        });

        // §10: mirrors ServiceOrderStatus at the database level — the app
        // (Rule::enum in the FormRequest, the status-action Service methods)
        // remains the primary authority, this is the backstop.
        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_status_check '.
            "CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))"
        );

        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_subtotal_check CHECK (subtotal >= 0)'
        );
        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_order_discount_check CHECK (order_discount >= 0)'
        );
        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_travel_fee_check CHECK (travel_fee >= 0)'
        );
        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_total_check CHECK (total >= 0)'
        );

        // §36: only enforced when both ends are actually set.
        DB::statement(
            'ALTER TABLE service_orders ADD CONSTRAINT service_orders_schedule_check '.
            'CHECK (scheduled_start_at IS NULL OR scheduled_end_at IS NULL OR scheduled_end_at >= scheduled_start_at)'
        );

        // §13/§15: the real, race-safe uniqueness of the human-facing
        // number — ServiceOrderNumberAllocator's row-locked allocation is
        // what keeps concurrent requests from ever colliding, this index
        // is the structural guarantee that a bug can never violate it.
        DB::statement(
            'CREATE UNIQUE INDEX service_orders_company_number_unique ON service_orders (company_id, number)'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS service_orders_company_number_unique');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_schedule_check');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_total_check');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_travel_fee_check');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_order_discount_check');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_subtotal_check');
        DB::statement('ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_status_check');

        Schema::dropIfExists('service_orders');
    }
};
