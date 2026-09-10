<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-04 §16-31. `customer_id` cascades (an address has no meaning
 * without its customer); `company_id` restricts (§15's reasoning applies
 * equally here). The partial unique index is the real enforcement of "at
 * most one primary address per customer" (§25) — application logic in
 * CustomerAddressService is what keeps it consistent in normal operation,
 * but the constraint is what makes "two primaries" structurally
 * impossible even under a bug or a race.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('customer_id')->constrained('customers')->cascadeOnDelete();

            $table->string('label');
            $table->string('type');

            $table->string('postal_code')->nullable();
            $table->string('street')->nullable();
            $table->string('number')->nullable();
            $table->string('complement')->nullable();
            $table->string('neighborhood')->nullable();
            $table->string('city')->nullable();
            $table->string('state', 2)->nullable();

            $table->string('reference_point')->nullable();

            $table->boolean('is_primary')->default(false);

            $table->timestamps();

            $table->index(['company_id', 'customer_id']);
        });

        DB::statement(
            'ALTER TABLE customer_addresses ADD CONSTRAINT customer_addresses_postal_code_check '.
            "CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$')"
        );

        DB::statement(
            'ALTER TABLE customer_addresses ADD CONSTRAINT customer_addresses_state_check '.
            "CHECK (state IS NULL OR state ~ '^[A-Z]{2}$')"
        );

        DB::statement(
            'CREATE UNIQUE INDEX customer_addresses_one_primary_per_customer '.
            'ON customer_addresses (customer_id) WHERE is_primary = true'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS customer_addresses_one_primary_per_customer');
        DB::statement('ALTER TABLE customer_addresses DROP CONSTRAINT IF EXISTS customer_addresses_state_check');
        DB::statement('ALTER TABLE customer_addresses DROP CONSTRAINT IF EXISTS customer_addresses_postal_code_check');

        Schema::dropIfExists('customer_addresses');
    }
};
