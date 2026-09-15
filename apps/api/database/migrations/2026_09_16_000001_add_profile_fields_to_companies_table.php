<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->string('legal_name')->nullable()->after('name');
            $table->string('trade_name')->nullable()->after('legal_name');

            $table->string('phone')->nullable()->after('document');
            $table->string('whatsapp')->nullable()->after('phone');
            $table->string('email')->nullable()->after('whatsapp');

            $table->string('postal_code')->nullable()->after('timezone');
            $table->string('street')->nullable()->after('postal_code');
            $table->string('number')->nullable()->after('street');
            $table->string('complement')->nullable()->after('number');
            $table->string('neighborhood')->nullable()->after('complement');
            $table->string('city')->nullable()->after('neighborhood');
            $table->string('state', 2)->nullable()->after('city');
            $table->string('reference_point')->nullable()->after('state');

            $table->string('logo_path')->nullable()->after('reference_point');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn([
                'legal_name',
                'trade_name',
                'phone',
                'whatsapp',
                'email',
                'postal_code',
                'street',
                'number',
                'complement',
                'neighborhood',
                'city',
                'state',
                'reference_point',
                'logo_path',
            ]);
        });
    }
};
