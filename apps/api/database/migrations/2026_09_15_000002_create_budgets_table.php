<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BUDGET-API-01. A Budget/Proposal is a commercial quote for a Customer —
 * deliberately independent of Project (no `project_id` column at all,
 * same discipline as `service_orders`/ADR-011). Carries a full historical
 * snapshot of the Customer it was created against, so `customer_id` stays
 * `restrictOnDelete()` (Customer is soft-deleted, never hard-deleted).
 *
 * Money columns (`subtotal`, `discount_amount`, `total`) are never
 * negative — enforced below. `cost_subtotal`/`margin_amount` are
 * deliberately NULLABLE with NO "not negative" constraint on
 * `margin_amount`: selling below cost is valid business behavior, and
 * "any item missing unit_cost" makes both of these NULL for the whole
 * Budget (never silently 0) — see App\Budgets\BudgetCalculator.
 * `margin_percentage` is 100% server-derived, never accepted as input.
 *
 * `proposal_token` is NULL while draft, generated only on submit
 * (cryptographically strong, unique) — the public, unauthenticated
 * `/proposals/{token}` lookup resolves through this column only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budgets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();

            $table->unsignedBigInteger('number');
            $table->string('status');

            $table->foreignUuid('customer_id')->constrained('customers')->restrictOnDelete();

            $table->string('title');
            $table->string('reference')->nullable();
            $table->text('notes')->nullable();

            // Customer snapshot, copied server-side at creation time —
            // never trusts a snapshot supplied by the client.
            $table->string('customer_name');
            $table->string('customer_document')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();

            $table->decimal('subtotal', 14, 2)->default('0.00');
            $table->decimal('cost_subtotal', 14, 2)->nullable();
            $table->decimal('margin_amount', 14, 2)->nullable();
            $table->decimal('margin_percentage', 9, 4)->nullable();
            $table->decimal('discount_amount', 14, 2)->default('0.00');
            $table->decimal('total', 14, 2)->default('0.00');

            $table->string('proposal_token')->nullable();
            $table->timestampTz('submitted_at')->nullable();

            $table->string('decision_source')->nullable();
            $table->foreignUuid('decision_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('decision_by_name')->nullable();
            $table->text('decision_note')->nullable();
            $table->timestampTz('decided_at')->nullable();

            $table->foreignUuid('created_by_user_id')->constrained('users')->restrictOnDelete();

            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'customer_id']);
            $table->index(['company_id', 'created_at']);
        });

        DB::statement(
            'ALTER TABLE budgets ADD CONSTRAINT budgets_status_check '.
            "CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected'))"
        );
        DB::statement(
            'ALTER TABLE budgets ADD CONSTRAINT budgets_decision_source_check '.
            "CHECK (decision_source IS NULL OR decision_source IN ('manual_internal', 'public_link'))"
        );

        DB::statement('ALTER TABLE budgets ADD CONSTRAINT budgets_subtotal_check CHECK (subtotal >= 0)');
        DB::statement(
            'ALTER TABLE budgets ADD CONSTRAINT budgets_cost_subtotal_check CHECK (cost_subtotal IS NULL OR cost_subtotal >= 0)'
        );
        // Deliberately NO check on margin_amount — negative margin
        // (selling below cost) is explicitly valid business behavior.
        DB::statement('ALTER TABLE budgets ADD CONSTRAINT budgets_discount_amount_check CHECK (discount_amount >= 0)');
        DB::statement('ALTER TABLE budgets ADD CONSTRAINT budgets_total_check CHECK (total >= 0)');

        DB::statement(
            'CREATE UNIQUE INDEX budgets_company_number_unique ON budgets (company_id, number)'
        );
        DB::statement(
            'CREATE UNIQUE INDEX budgets_proposal_token_unique ON budgets (proposal_token) WHERE proposal_token IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS budgets_proposal_token_unique');
        DB::statement('DROP INDEX IF EXISTS budgets_company_number_unique');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_total_check');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_discount_amount_check');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_cost_subtotal_check');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_subtotal_check');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_decision_source_check');
        DB::statement('ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_status_check');

        Schema::dropIfExists('budgets');
    }
};
