<?php

namespace App\CatalogItems;

use App\Models\CatalogItem;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * §37: centralizes create/update so the controller stays thin. `company_id`
 * is never handled here directly — it's forced by BelongsToCompany's
 * `creating` hook from CurrentCompanyContext, the same as Customer.
 *
 * §9/CODE9-CODE10: catches a real Postgres unique-violation (SQLSTATE
 * 23505) on the specific `catalog_items_company_code_unique` index and
 * converts it to a clean 422 on the `code` field — every other
 * QueryException (wrong constraint, FK violation, connection error, ...)
 * is rethrown unchanged, never masked as a code conflict.
 */
class CatalogItemService
{
    private const string CODE_UNIQUE_CONSTRAINT = 'catalog_items_company_code_unique';

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $attributes): CatalogItem
    {
        try {
            return CatalogItem::create($attributes);
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfCodeConflict($e);
            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(CatalogItem $item, array $attributes): CatalogItem
    {
        $item->fill($attributes);

        try {
            // A nested transaction here becomes a real Postgres SAVEPOINT
            // (Laravel does this automatically when already inside a
            // transaction) — without it, a caught constraint violation
            // would poison the outer request/test transaction, breaking
            // every query issued after this method returns.
            DB::transaction(fn () => $item->save());
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfCodeConflict($e);
            throw $e;
        }

        return $item;
    }

    private function rethrowAsValidationIfCodeConflict(QueryException $e): void
    {
        if ($e->getCode() !== '23505') {
            return;
        }

        if (! str_contains($e->getMessage(), self::CODE_UNIQUE_CONSTRAINT)) {
            return;
        }

        throw ValidationException::withMessages([
            'code' => 'Já existe um item de catálogo com este código.',
        ]);
    }
}
