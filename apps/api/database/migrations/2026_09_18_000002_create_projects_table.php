<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * PROJECT-API-01 (§2/§3/§18/§20/§54). A Project (Obra) belongs to a real
 * Customer via a LIVE relation — `customer_id` only, deliberately no
 * `customer_name` snapshot (§18): Project is an operational hub, not a
 * historical document like Budget/ServiceOrder's proposal snapshots.
 *
 * The Obra's own address is a flat, structured, mutable snapshot
 * (`address_*`, §21/§28) — NOT named `execution_*` (that prefix means
 * "where a ServiceOrder was executed"; here it's the Obra's own physical
 * location, so `address_*`). `customer_address_id` is only an optional
 * ORIGIN reference (§20/§22) — nullOnDelete so losing the live
 * CustomerAddress row never loses the address already copied onto this
 * table (§53).
 *
 * `source_budget_id` (§10-17 of PROJECT-API-01) is a UNILATERAL,
 * immutable-after-create reference to the Budget this Obra originated
 * from — Budget itself has and gets NO relation back to Project (see
 * ADR-011/ADR-013 precedent, reinforced by the structural test in this
 * gate). `restrictOnDelete()` since Budget has no DELETE endpoint at all
 * today.
 *
 * No `deleted_at` — no delete semantics exist for Project in v1 (§47).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();

            $table->unsignedBigInteger('number');
            $table->string('name');
            $table->string('reference')->nullable();
            $table->string('status');

            $table->foreignUuid('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignUuid('customer_address_id')->nullable()->constrained('customer_addresses')->nullOnDelete();

            $table->string('address_postal_code')->nullable();
            $table->string('address_street')->nullable();
            $table->string('address_number')->nullable();
            $table->string('address_complement')->nullable();
            $table->string('address_neighborhood')->nullable();
            $table->string('address_city')->nullable();
            $table->string('address_state', 2)->nullable();
            $table->string('address_reference_point')->nullable();

            $table->date('expected_start_date')->nullable();
            $table->date('expected_end_date')->nullable();

            $table->foreignUuid('source_budget_id')->nullable()->constrained('budgets')->restrictOnDelete();

            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'customer_id']);
            $table->index(['company_id', 'updated_at']);
            $table->index('source_budget_id');
            $table->index('customer_address_id');
        });

        // §4/§5: mirrors ProjectStatus at the database level — the app
        // (Rule::enum in the FormRequest) remains the primary authority,
        // this is the backstop.
        DB::statement(
            'ALTER TABLE projects ADD CONSTRAINT projects_status_check '.
            "CHECK (status IN ('planning', 'in_progress', 'paused', 'completed'))"
        );

        // §9/§64: the real, race-safe uniqueness of the human-facing
        // number — ProjectNumberAllocator's row-locked allocation is what
        // keeps concurrent requests from ever colliding, this index is
        // the structural guarantee that a bug can never violate it.
        DB::statement(
            'CREATE UNIQUE INDEX projects_company_number_unique ON projects (company_id, number)'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS projects_company_number_unique');
        DB::statement('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check');

        Schema::dropIfExists('projects');
    }
};
