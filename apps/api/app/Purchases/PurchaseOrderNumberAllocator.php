<?php

namespace App\Purchases;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * SUPPLY-API-01C §2/§15/§47. Allocates the next sequential `number` for a
 * Company, race-safe under real concurrent PostgreSQL transactions via
 * `SELECT ... FOR UPDATE` row locking on `purchase_order_sequences`.
 * Mirrors ProjectNumberAllocator/BudgetNumberAllocator/
 * ServiceOrderNumberAllocator exactly.
 *
 * MUST be called from within the caller's own transaction
 * (PurchaseOrderService::create() wraps its whole flow in
 * DB::transaction()) — a later failure rolls back the `next_number`
 * increment too, so a failed create never burns a number.
 */
class PurchaseOrderNumberAllocator
{
    public function allocate(string $companyId): int
    {
        $row = DB::table('purchase_order_sequences')
            ->where('company_id', $companyId)
            ->lockForUpdate()
            ->first();

        if ($row === null) {
            $this->ensureSequenceRowExists($companyId);

            $row = DB::table('purchase_order_sequences')
                ->where('company_id', $companyId)
                ->lockForUpdate()
                ->first();
        }

        $number = (int) $row->next_number;

        DB::table('purchase_order_sequences')
            ->where('company_id', $companyId)
            ->update(['next_number' => $number + 1, 'updated_at' => now()]);

        return $number;
    }

    /**
     * The very first allocation for a Company has no row to lock yet.
     * Inserting is itself race-prone (two concurrent first-ever requests
     * for the same company), so the insert is wrapped in its own nested
     * DB::transaction() (a real Postgres SAVEPOINT inside the caller's
     * outer transaction) — a duplicate-key failure here is caught and
     * ignored (another concurrent request already won the insert).
     */
    private function ensureSequenceRowExists(string $companyId): void
    {
        try {
            DB::transaction(function () use ($companyId) {
                DB::table('purchase_order_sequences')->insert([
                    'company_id' => $companyId,
                    'next_number' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            });
        } catch (QueryException $e) {
            if ($e->getCode() !== '23505') {
                throw $e;
            }
        }
    }
}
