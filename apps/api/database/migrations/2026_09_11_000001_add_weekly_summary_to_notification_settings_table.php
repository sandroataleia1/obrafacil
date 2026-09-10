<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * NOTIFICATIONS-API-01 §7: the weekly summary mirrors daily_summary_enabled
 * /daily_summary_time's shape. `weekly_summary_day` uses ISO-8601 (1=Monday
 * ... 7=Sunday) — the CHECK constraint is the authoritative enforcement
 * point, not just application-level validation, matching the existing
 * `users_phone_e164_check` pattern. Deliberately a plain nullable smallint,
 * never a Postgres enum (§7).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_settings', function (Blueprint $table) {
            $table->boolean('weekly_summary_enabled')->default(false)->after('daily_summary_time');
            $table->unsignedTinyInteger('weekly_summary_day')->nullable()->after('weekly_summary_enabled');
            $table->time('weekly_summary_time')->nullable()->after('weekly_summary_day');
        });

        DB::statement(
            'ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_weekly_summary_day_check '.
            'CHECK (weekly_summary_day IS NULL OR weekly_summary_day BETWEEN 1 AND 7)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_weekly_summary_day_check');

        Schema::table('notification_settings', function (Blueprint $table) {
            $table->dropColumn(['weekly_summary_enabled', 'weekly_summary_day', 'weekly_summary_time']);
        });
    }
};
