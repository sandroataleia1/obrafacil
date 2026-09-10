<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('company_id')->constrained()->cascadeOnDelete();
            // Plain string, never a DB enum — new event types will be added
            // to the product frequently (see NotificationEventType).
            $table->string('type');
            $table->string('entity_type')->nullable();
            $table->string('entity_id')->nullable();
            $table->jsonb('payload')->default('{}');
            $table->string('deduplication_key');
            $table->timestamp('occurred_at');
            $table->timestamps();

            // The real dedupe guarantee — a `count()`/`exists()` check in
            // application code is a race under concurrency, this constraint
            // is not.
            $table->unique(['company_id', 'deduplication_key']);
            $table->index(['company_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_events');
    }
};
