<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-04 §3-15. `document`/`phone` are stored canonical (digits-only /
 * E.164) — the CHECK constraints are the authoritative enforcement point,
 * same pattern as `users_phone_e164_check` (BACKEND-02). `company_id` is
 * `restrictOnDelete()` (§15) — a company is never deleted through this
 * app today, but customer history must never silently vanish if that ever
 * changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->string('kind');
            $table->string('name');
            $table->string('legal_name')->nullable();
            $table->string('trade_name')->nullable();
            $table->string('document')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'name']);
        });

        DB::statement(
            'ALTER TABLE customers ADD CONSTRAINT customers_phone_e164_check '.
            "CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$')"
        );

        // §9: the document's digit count depends on `kind` — CPF (11) for
        // individual, CNPJ (14) for company. Mirrors (does not replace)
        // App\Rules\Cpf / App\Rules\Cnpj's check-digit validation, which
        // the database itself cannot compute.
        DB::statement(
            'ALTER TABLE customers ADD CONSTRAINT customers_document_format_check '.
            "CHECK (document IS NULL OR (kind = 'individual' AND document ~ '^[0-9]{11}$') ".
            "OR (kind = 'company' AND document ~ '^[0-9]{14}$'))"
        );

        // §11: a *partial* unique index — deliberately excludes soft-deleted
        // rows. A document belonging to a deleted customer is not "in use"
        // in any practical sense; keeping it permanently reserved would
        // block genuine re-registration for no real benefit. Postgres
        // already treats every NULL as distinct in a unique index, so
        // `document IS NOT NULL` here is about intent clarity, not
        // behavior change.
        DB::statement(
            'CREATE UNIQUE INDEX customers_company_document_unique ON customers (company_id, document) '.
            'WHERE deleted_at IS NULL AND document IS NOT NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customers_company_document_unique');
        DB::statement('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_document_format_check');
        DB::statement('ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_e164_check');

        Schema::dropIfExists('customers');
    }
};
