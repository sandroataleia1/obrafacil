<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01A §3-8. `Material` is Company-wide (no `project_id`), the
 * operational counterpart to `CatalogItem` (ADR-010/ADR-017 — deliberately
 * never linked). `company_id` is `restrictOnDelete()`, same policy as
 * `customers`/`catalog_items`. No `deleted_at` — this domain's removal is
 * `active=false` or a dependency-guarded hard `DELETE`, never soft delete
 * (ADR-017 #5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('materials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->string('unit_code');
            $table->string('unit_custom_label')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'active', 'name']);
        });

        // §4: mirrors the MaterialUnitCode enum at the database level —
        // same backstop style as catalog_items_type_check.
        DB::statement(
            'ALTER TABLE materials ADD CONSTRAINT materials_unit_code_check '.
            "CHECK (unit_code IN ('un', 'kg', 't', 'm', 'm2', 'm3', 'l', 'sc', 'cx', 'other'))"
        );

        // §5: biconditional — `other` requires a non-empty custom label;
        // any other code requires the custom label to be absent. The
        // application validates this first (StoreMaterialRequest/
        // UpdateMaterialRequest); this CHECK is the backstop, matching the
        // "não permitir kg + custom 'saco'" requirement exactly.
        DB::statement(
            'ALTER TABLE materials ADD CONSTRAINT materials_unit_custom_label_check '.
            "CHECK ((unit_code = 'other' AND unit_custom_label IS NOT NULL AND btrim(unit_custom_label) <> '') ".
            "OR (unit_code <> 'other' AND unit_custom_label IS NULL))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_unit_custom_label_check');
        DB::statement('ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_unit_code_check');

        Schema::dropIfExists('materials');
    }
};
