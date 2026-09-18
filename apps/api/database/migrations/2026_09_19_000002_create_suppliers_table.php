<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SUPPLY-API-01A §16-23/ADR-017 #6-#8. `document`/`phone` are stored
 * canonical (digits-only / E.164), same discipline as `customers`. No
 * `kind` field — Supplier accepts either CPF (11 digits) or CNPJ (14
 * digits), dispatched by length, not by an explicit type column (ADR-017
 * #6). `company_id` is `restrictOnDelete()`. No `deleted_at` — removal is
 * `active=false` or a dependency-guarded hard `DELETE` (ADR-017 #8).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->string('document')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'active', 'name']);
        });

        DB::statement(
            'ALTER TABLE suppliers ADD CONSTRAINT suppliers_phone_e164_check '.
            "CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$')"
        );

        // §20: format-only backstop (11 or 14 digits) — checksum validity
        // stays purely an application concern (App\Rules\CpfOrCnpj), same
        // as customers_document_format_check does for Customer.
        DB::statement(
            'ALTER TABLE suppliers ADD CONSTRAINT suppliers_document_format_check '.
            "CHECK (document IS NULL OR document ~ '^[0-9]{11}$' OR document ~ '^[0-9]{14}$')"
        );

        // §18: a partial unique index — multiple NULLs are always allowed
        // (Postgres treats every NULL as distinct already; `document IS
        // NOT NULL` here is about intent clarity, matching
        // customers_company_document_unique's own comment).
        DB::statement(
            'CREATE UNIQUE INDEX suppliers_company_document_unique ON suppliers (company_id, document) '.
            'WHERE document IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS suppliers_company_document_unique');
        DB::statement('ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_document_format_check');
        DB::statement('ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_phone_e164_check');

        Schema::dropIfExists('suppliers');
    }
};
