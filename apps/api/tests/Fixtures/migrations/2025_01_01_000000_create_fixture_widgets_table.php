<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Test-only table used to exercise BelongsToCompany/CompanyScope without
 * inventing a real business model. Never loaded outside tests: it lives
 * under tests/Fixtures, not database/migrations, so `php artisan migrate`
 * never creates it in any real environment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fixture_widgets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fixture_widgets');
    }
};
