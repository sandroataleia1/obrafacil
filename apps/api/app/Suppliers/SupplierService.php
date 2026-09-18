<?php

namespace App\Suppliers;

use App\Models\PurchaseOrder;
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
 * SUPPLY-API-01C §37/§43/DOMAIN-SERVICE-TENANT-DEFENSE-01: `update()`/
 * `delete()` never trust the Model instance the caller already holds —
 * both re-resolve by id under CompanyScope first. `delete()` additionally
 * takes a real row lock (`lockForUpdate()`) around the whole
 * check-then-delete, so a concurrent PurchaseOrder create for this same
 * Supplier serializes against it instead of racing a plain
 * SELECT-then-DELETE (§43).
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
        $scopedSupplier = Supplier::query()->findOrFail($supplier->id);

        $scopedSupplier->fill($attributes);
        $this->saveOrConvertDocumentConflict($scopedSupplier);

        return $scopedSupplier;
    }

    public function delete(Supplier $supplier): void
    {
        DB::transaction(function () use ($supplier) {
            $lockedSupplier = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);

            if ($this->hasPurchaseOrders($lockedSupplier)) {
                throw ValidationException::withMessages([
                    'supplier' => 'Este fornecedor possui pedidos de compra registrados e não pode ser excluído.',
                ]);
            }

            $lockedSupplier->delete();
        });
    }

    /**
     * ADR-017 #8: true once the Supplier has any purchase_orders row,
     * including cancelled ones — SUPPLY-API-01C wires this for real.
     */
    public function hasPurchaseOrders(Supplier $supplier): bool
    {
        return PurchaseOrder::query()->where('supplier_id', $supplier->id)->exists();
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
