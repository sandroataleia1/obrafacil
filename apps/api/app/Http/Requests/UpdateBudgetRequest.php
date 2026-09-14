<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBudgetRelations;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/budgets/{budget} — draft-only (enforced in
 * App\Budgets\BudgetService::updateHeader() via BudgetLocker, a 409 when
 * the Budget is no longer draft). customer_id/title/reference/notes/
 * discount_amount only — items are never touched here.
 */
class UpdateBudgetRequest extends FormRequest
{
    use ValidatesBudgetRelations;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'id' => ['prohibited'],
            'company_id' => ['prohibited'],
            'number' => ['prohibited'],
            'status' => ['prohibited'],
            'created_by_user_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'project_id' => ['prohibited'],
            'subtotal' => ['prohibited'],
            'sale_subtotal' => ['prohibited'],
            'cost_subtotal' => ['prohibited'],
            'margin_amount' => ['prohibited'],
            'margin_percentage' => ['prohibited'],
            'total' => ['prohibited'],
            'proposal_token' => ['prohibited'],
            'calculation_snapshot' => ['prohibited'],
            'items' => ['prohibited'],
            'customer_name' => ['prohibited'],
            'customer_document' => ['prohibited'],
            'customer_phone' => ['prohibited'],
            'customer_email' => ['prohibited'],

            'customer_id' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateCustomer($validator);
        });
    }
}
