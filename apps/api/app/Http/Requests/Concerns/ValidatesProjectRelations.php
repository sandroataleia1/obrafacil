<?php

namespace App\Http\Requests\Concerns;

use App\Enums\BudgetStatus;
use App\Models\Budget;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;

/**
 * PROJECT-API-01 §18-19/§22/§13-15. Shared by StoreProjectRequest and
 * UpdateProjectRequest — every lookup goes through the tenant-scoped
 * Eloquent models (Customer/CustomerAddress/Budget all apply CompanyScope
 * automatically via BelongsToCompany), so a cross-tenant id and a
 * genuinely nonexistent id produce the exact same generic error message —
 * never revealing which case it was. Mirrors ValidatesBudgetRelations/
 * ValidatesServiceOrderRelations.
 */
trait ValidatesProjectRelations
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

    /**
     * §22: customer_address_id must belong to the CUSTOMER being targeted
     * by this same request (the new customer_id if one is being set,
     * otherwise whatever customer_id is already resolvable) — never just
     * "any address in the active Company."
     */
    private function validateCustomerAddress(ValidatorContract $validator, ?string $effectiveCustomerId): void
    {
        $addressId = $this->input('customer_address_id');
        if (! is_string($addressId) || $addressId === '') {
            return;
        }

        if ($effectiveCustomerId === null) {
            return;
        }

        $address = CustomerAddress::query()->where('customer_id', $effectiveCustomerId)->find($addressId);
        if ($address === null) {
            $validator->errors()->add('customer_address_id', 'Endereço inválido.');
        }
    }

    /**
     * §13-15: only accepted on create (POST). Must be `approved`, belong
     * to the active Company, and share the same customer_id as the
     * Project being created.
     */
    private function validateSourceBudget(ValidatorContract $validator, ?string $effectiveCustomerId): void
    {
        $sourceBudgetId = $this->input('source_budget_id');
        if (! is_string($sourceBudgetId) || $sourceBudgetId === '') {
            return;
        }

        $budget = Budget::query()->find($sourceBudgetId);
        if ($budget === null) {
            $validator->errors()->add('source_budget_id', 'Orçamento inválido.');

            return;
        }

        if ($budget->status !== BudgetStatus::Approved) {
            $validator->errors()->add('source_budget_id', 'Este orçamento não está aprovado.');

            return;
        }

        if ($effectiveCustomerId !== null && $budget->customer_id !== $effectiveCustomerId) {
            $validator->errors()->add('source_budget_id', 'O orçamento selecionado pertence a outro cliente.');
        }
    }
}
