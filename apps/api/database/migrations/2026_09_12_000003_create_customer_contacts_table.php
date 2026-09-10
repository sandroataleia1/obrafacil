<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-04 addendum §70-96. Mirrors customer_addresses' structure and
 * "at most one primary" enforcement exactly — `phone` and `whatsapp` are
 * deliberately separate columns (§72: the call number and the WhatsApp
 * number are not guaranteed to be the same). No SoftDeletes here: a
 * contact has no downstream history dependency yet in this gate (unlike
 * Customer, which budgets/projects/service orders will eventually
 * reference) — `active=false` (§86) is the "no longer valid but keep the
 * record" mechanism instead. If a real hard-delete-must-be-reversible need
 * surfaces later, that's a schema change to make explicitly, not a
 * default assumed now.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_contacts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('customer_id')->constrained('customers')->cascadeOnDelete();

            $table->string('name');
            $table->string('role')->nullable();
            $table->string('department')->nullable();

            $table->string('phone')->nullable();
            $table->string('whatsapp')->nullable();
            $table->string('email')->nullable();

            $table->text('notes')->nullable();

            $table->boolean('is_primary')->default(false);
            $table->boolean('active')->default(true);

            $table->timestamps();

            $table->index(['company_id', 'customer_id']);
        });

        DB::statement(
            'ALTER TABLE customer_contacts ADD CONSTRAINT customer_contacts_phone_e164_check '.
            "CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$')"
        );

        DB::statement(
            'ALTER TABLE customer_contacts ADD CONSTRAINT customer_contacts_whatsapp_e164_check '.
            "CHECK (whatsapp IS NULL OR whatsapp ~ '^\\+[1-9][0-9]{6,14}$')"
        );

        DB::statement(
            'CREATE UNIQUE INDEX customer_contacts_one_primary_per_customer '.
            'ON customer_contacts (customer_id) WHERE is_primary = true'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customer_contacts_one_primary_per_customer');
        DB::statement('ALTER TABLE customer_contacts DROP CONSTRAINT IF EXISTS customer_contacts_whatsapp_e164_check');
        DB::statement('ALTER TABLE customer_contacts DROP CONSTRAINT IF EXISTS customer_contacts_phone_e164_check');

        Schema::dropIfExists('customer_contacts');
    }
};
