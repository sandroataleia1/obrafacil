<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BACKEND-06 §13-16. One row per Company; `company_id` IS the primary key
 * (no separate `id`) so `SELECT ... WHERE company_id = ? FOR UPDATE` locks
 * exactly one row per tenant, never blocking a different company's
 * allocation. `App\ServiceOrders\ServiceOrderNumberAllocator` is the only
 * place this table is touched — always inside the creating O.S.'s own
 * transaction, so a later rollback (validation failure, item error, ...)
 * also rolls back the `next_number` increment, never burning a number on
 * a failed create (§16/C22/N3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_order_sequences', function (Blueprint $table) {
            $table->foreignUuid('company_id')->primary()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });

        DB::statement(
            'ALTER TABLE service_order_sequences ADD CONSTRAINT service_order_sequences_next_number_check '.
            'CHECK (next_number >= 1)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE service_order_sequences DROP CONSTRAINT IF EXISTS service_order_sequences_next_number_check');

        Schema::dropIfExists('service_order_sequences');
    }
};
