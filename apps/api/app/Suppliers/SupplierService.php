<?php

namespace App\Suppliers;

use App\Models\Supplier;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01A §30/ADR-017 #8. Controller stays thin.
 *
 * §15/§18: StoreSupplierRequest/UpdateSupplierRequest already pre-check
 * document uniqueness for a fast, friendly response in the common case —
 * but that check and the actual insert/update are two separate
 * statements, so two concurrent requests can both pass validation for the
 * same (company_id, document) before either commits. PostgreSQL's real
 * partial unique index (suppliers_company_document_unique) remains the
 * sole authority; this class is what turns that constraint's rejection
 * into the same ValidationException shape the pre-check already
 * produces, instead of a raw 500 — same pattern as CustomerService.
 *
 * `delete()` is the seam SUPPLY-API-01C extends with the PurchaseOrder
 * dependency guard (ADR-017 #8) — currently unconditional because that
 * table doesn't exist yet.
 */
class SupplierService
{
    private const string DOCUMENT_UNIQUE_CONSTRAINT = 'suppliers_company_document_unique';

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $attributes): Supplier
    {
        try {
            // §S15/discovered during this gate: a nested DB::transaction()
            // here becomes a real Postgres SAVEPOINT when called from
            // within an already-open transaction (the request's own, or —
            // in tests — RefreshDatabase's wrapping transaction). Without
            // it, catching the QueryException below still leaves the
            // *outer* transaction poisoned (Postgres aborts the whole
            // transaction on any statement error until a real
            // ROLLBACK/ROLLBACK TO SAVEPOINT) — every query issued after
            // this method returns would fail with "current transaction is
            // aborted", including the caller's own subsequent reads. Same
            // fix already applied to update()/CustomerService/
            // CatalogItemService's own update() paths; this create() path
            // needed the identical protection.
            return DB::transaction(fn () => Supplier::create($attributes));
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDocumentConflict($e);

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(Supplier $supplier, array $attributes): Supplier
    {
        $supplier->fill($attributes);
        $this->saveOrConvertDocumentConflict($supplier);

        return $supplier;
    }

    public function delete(Supplier $supplier): void
    {
        $supplier->delete();
    }

    /**
     * ADR-017 #8: true once the Supplier has any purchase_orders row,
     * including cancelled ones. Always false in this gate — extended by
     * SUPPLY-API-01C once that table exists, never duplicated elsewhere.
     */
    public function hasPurchaseOrders(Supplier $supplier): bool
    {
        return false;
    }

    /**
     * A nested DB::transaction() here becomes a real Postgres SAVEPOINT
     * when called from within an already-open transaction (the request's
     * own, or — in tests — RefreshDatabase's wrapping transaction).
     * Without it, catching the QueryException below would still leave the
     * *outer* transaction poisoned, breaking every query issued after this
     * method returns — same fix already established by CustomerService/
     * CatalogItemService.
     */
    private function saveOrConvertDocumentConflict(Supplier $supplier): void
    {
        try {
            DB::transaction(fn () => $supplier->save());
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDocumentConflict($e);

            throw $e;
        }
    }

    /**
     * Only ever converts the one specific, known conflict this class is
     * responsible for — every other QueryException (connection failure,
     * a different constraint, ...) is rethrown unchanged.
     */
    private function rethrowAsValidationIfDocumentConflict(QueryException $e): void
    {
        if ($e->getCode() !== '23505') {
            return;
        }

        if (! str_contains($e->getMessage(), self::DOCUMENT_UNIQUE_CONSTRAINT)) {
            return;
        }

        throw ValidationException::withMessages([
            'document' => 'Já existe um fornecedor com este documento.',
        ]);
    }
}
