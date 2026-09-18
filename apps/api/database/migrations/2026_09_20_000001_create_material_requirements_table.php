<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01B §1-4. A MaterialRequirement is pure planning (Project +
 * Material + planned quantity) — no unit/name snapshot (§33-35: Material's
 * unit/name stay a LIVE relation, which is exactly why Material's unit
 * becomes immutable and its delete guarded the moment a Requirement
 * exists — see MaterialService::hasDependents()). `company_id`/
 * `project_id`/`material_id` are all `restrictOnDelete()`, matching the
 * `materials`/`suppliers` policy (ADR-010/ADR-017). One Project can have
 * at most one Requirement per Material (§3) — to change the planned
 * quantity, edit the existing row; never insert a second one and sum.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('material_requirements', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('project_id')->constrained('projects')->restrictOnDelete();
            $table->foreignUuid('material_id')->constrained('materials')->restrictOnDelete();
            $table->decimal('required_quantity', 14, 3);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'project_id']);
            $table->unique(['project_id', 'material_id'], 'material_requirements_project_material_unique');
        });

        // §4: application validates first (Store/UpdateMaterialRequirementRequest); this CHECK is the backstop.
        DB::statement(
            'ALTER TABLE material_requirements ADD CONSTRAINT material_requirements_quantity_positive_check '.
            'CHECK (required_quantity > 0)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE material_requirements DROP CONSTRAINT IF EXISTS material_requirements_quantity_positive_check');

        Schema::dropIfExists('material_requirements');
    }
};
