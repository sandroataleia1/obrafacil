<?php

namespace App\Http\Requests\Concerns;

use App\Models\CatalogItem;
use App\Models\Customer;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;

/**
 * BUDGET-API-01. Shared by StoreBudgetRequest/UpdateBudgetRequest and the
 * item requests — every lookup goes through the tenant-scoped Eloquent
 * models (Customer/CatalogItem both apply CompanyScope automatically via
 * BelongsToCompany), so a cross-tenant id and a genuinely nonexistent id
 * produce the exact same generic error message — never revealing which
 * case it was. Mirrors ValidatesServiceOrderRelations.
 */
trait ValidatesBudgetRelations
{
    private function validateCustomer(ValidatorContract $validator): void
    {
        $customerId = $this->input('customer_id');
        if (! is_string($customerId) || $customerId === '') {
            return;
        }

        if (Customer::query()->find($customerId) === null) {
            $validator->errors()->add('customer_id', 'Cliente inválido.');
        }
    }

    private function validateCatalogItem(ValidatorContract $validator, string $field = 'catalog_item_id'): void
    {
        $catalogItemId = $this->input($field);
        if (! is_string($catalogItemId) || $catalogItemId === '') {
            return;
        }

        if (CatalogItem::query()->find($catalogItemId) === null) {
            $validator->errors()->add($field, 'Item de catálogo inválido.');
        }
    }
}
