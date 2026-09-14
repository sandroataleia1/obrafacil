<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BUDGET-API-01 §5-8 (number allocation). Mirrors
 * `service_order_sequences` exactly — one row per Company,
 * `company_id` IS the primary key, so a row-locked
 * `SELECT ... WHERE company_id = ? FOR UPDATE` locks exactly one
 * company's allocation. `App\Budgets\BudgetNumberAllocator` is the only
 * place this table is touched, always inside the creating Budget's own
 * transaction, so a rollback also rolls back the `next_number` increment
 * — a failed create never burns a number.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('budget_sequences', function (Blueprint $table) {
            $table->foreignUuid('company_id')->primary()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });

        DB::statement(
            'ALTER TABLE budget_sequences ADD CONSTRAINT budget_sequences_next_number_check '.
            'CHECK (next_number >= 1)'
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE budget_sequences DROP CONSTRAINT IF EXISTS budget_sequences_next_number_check');

        Schema::dropIfExists('budget_sequences');
    }
};
