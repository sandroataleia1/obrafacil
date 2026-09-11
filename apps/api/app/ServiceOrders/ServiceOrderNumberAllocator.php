<?php

namespace App\ServiceOrders;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * BACKEND-06 §13-16. Allocates the next sequential `number` for a Company,
 * race-safe under real concurrent PostgreSQL transactions via
 * `SELECT ... FOR UPDATE` row locking on `service_order_sequences`.
 *
 * MUST be called from within the caller's own transaction (ServiceOrderService::create
 * wraps its whole flow in DB::transaction()) — that is what makes a later
 * failure (an invalid item, a discount check, anything) roll back the
 * `next_number` increment along with everything else, so a failed create
 * never burns a number (§16/C22/N3).
 */
class ServiceOrderNumberAllocator
{
    public function allocate(string $companyId): int
    {
        $row = DB::table('service_order_sequences')
            ->where('company_id', $companyId)
            ->lockForUpdate()
            ->first();

        if ($row === null) {
            $this->ensureSequenceRowExists($companyId);

            $row = DB::table('service_order_sequences')
                ->where('company_id', $companyId)
                ->lockForUpdate()
                ->first();
        }

        $number = (int) $row->next_number;

        DB::table('service_order_sequences')
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
     * ignored (another concurrent request already won the insert), and
     * the outer transaction is never poisoned by the caught exception.
     * Either way, the row-locked SELECT right after this always finds a
     * row to lock, from whichever request actually won the insert.
     */
    private function ensureSequenceRowExists(string $companyId): void
    {
        try {
            DB::transaction(function () use ($companyId) {
                DB::table('service_order_sequences')->insert([
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
