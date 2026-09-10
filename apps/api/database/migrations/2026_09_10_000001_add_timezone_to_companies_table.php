<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            // America/Sao_Paulo: the pilot's current (only) market. IANA
            // validation belongs to a future write endpoint, not this
            // migration — nothing writes to this column yet.
            $table->string('timezone')->default('America/Sao_Paulo')->after('document');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
