<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * PROJECT-API-01. One row per Company; `company_id` IS the primary key (no
 * separate `id`), mirroring `service_order_sequences`/`budget_sequences`
 * exactly. `App\Projects\ProjectNumberAllocator` is the only place this
 * table is touched — always inside the creating Project's own transaction,
 * so a later rollback also rolls back the `next_number` increment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_sequences', function (Blueprint $table) {
            $table->foreignUuid('company_id')->primary()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });

        DB::statement(
            'ALTER TABLE project_sequences ADD CONSTRAINT project_sequences_next_number_check '.
            'CHECK (next_number >= 1)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE project_sequences DROP CONSTRAINT IF EXISTS project_sequences_next_number_check');

        Schema::dropIfExists('project_sequences');
    }
};
