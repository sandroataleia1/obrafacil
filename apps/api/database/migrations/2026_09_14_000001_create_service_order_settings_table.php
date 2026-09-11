<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-06 §31-35. One row per Company holding the default travel fee
 * copied into a new ServiceOrder when the request omits `travel_fee`
 * (§34). `company_id` is `restrictOnDelete()` — same policy as every
 * other tenant-scoped table in this app (a company is never deleted
 * through the app today, but history must never silently vanish).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->unique()->constrained()->restrictOnDelete();
            $table->decimal('default_travel_fee', 14, 2)->default('0.00');
            $table->timestamps();
        });

        DB::statement(
            'ALTER TABLE service_order_settings ADD CONSTRAINT service_order_settings_default_travel_fee_check '.
            'CHECK (default_travel_fee >= 0)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE service_order_settings DROP CONSTRAINT IF EXISTS service_order_settings_default_travel_fee_check');

        Schema::dropIfExists('service_order_settings');
    }
};
