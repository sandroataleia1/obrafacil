<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * SUPPLY-API-01C1 §12-13. `purchase_orders.updated_at`/
 * `purchase_order_items.updated_at` are the optimistic-concurrency
 * version for this aggregate (§11) — a whole-second column (the default
 * Laravel `timestamps()` precision, confirmed via `information_schema.
 * columns.datetime_precision = 0` before this migration) lets two
 * mutations inside the same wall-clock second produce an IDENTICAL
 * version, defeating the staleness check. Widened to microsecond
 * precision (6) — only these two tables, no other table in the schema is
 * touched.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE purchase_orders ALTER COLUMN created_at TYPE timestamp(6) without time zone');
        DB::statement('ALTER TABLE purchase_orders ALTER COLUMN updated_at TYPE timestamp(6) without time zone');
        DB::statement('ALTER TABLE purchase_order_items ALTER COLUMN created_at TYPE timestamp(6) without time zone');
        DB::statement('ALTER TABLE purchase_order_items ALTER COLUMN updated_at TYPE timestamp(6) without time zone');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE purchase_order_items ALTER COLUMN updated_at TYPE timestamp(0) without time zone');
        DB::statement('ALTER TABLE purchase_order_items ALTER COLUMN created_at TYPE timestamp(0) without time zone');
        DB::statement('ALTER TABLE purchase_orders ALTER COLUMN updated_at TYPE timestamp(0) without time zone');
        DB::statement('ALTER TABLE purchase_orders ALTER COLUMN created_at TYPE timestamp(0) without time zone');
    }
};
