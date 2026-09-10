<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            // Having a phone number on file is NOT consent — this starts
            // false for every user, on purpose, until an explicit opt-in UI
            // exists.
            $table->boolean('whatsapp_enabled')->default(false);
            $table->boolean('quiet_hours_enabled')->default(true);
            $table->time('quiet_start')->default('21:00');
            $table->time('quiet_end')->default('07:00');
            $table->boolean('daily_summary_enabled')->default(false);
            $table->time('daily_summary_time')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_settings');
    }
};
