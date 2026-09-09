<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `phone` is stored only in canonical E.164 form (e.g. +5511999999999).
 * The CHECK constraint is the authoritative enforcement point — there is no
 * write endpoint for it yet in this round, so the database itself is what
 * guarantees no non-canonical value can ever be persisted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone')->nullable()->after('email');
        });

        DB::statement(
            'ALTER TABLE users ADD CONSTRAINT users_phone_e164_check '.
            "CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$')"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_e164_check');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('phone');
        });
    }
};
