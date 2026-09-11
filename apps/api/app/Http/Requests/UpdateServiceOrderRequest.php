<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesServiceOrderRelations;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/service-orders/{serviceOrder} — §39/§40. Header-only: never
 * updates `status` (ST14 — status actions are the only way to change it,
 * §48) and never syncs `items` (§39 — "NÃO sincroniza items
 * silenciosamente"; items have their own nested endpoints, §43-46).
 */
class UpdateServiceOrderRequest extends FormRequest
{
    use ValidatesServiceOrderRelations;

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
            'total' => ['prohibited'],
            'items' => ['prohibited'],
            'customer_name' => ['prohibited'],
            'customer_document' => ['prohibited'],
            'customer_phone' => ['prohibited'],
            'customer_email' => ['prohibited'],
            'execution_address_label' => ['prohibited'],
            'execution_address_type' => ['prohibited'],
            'execution_postal_code' => ['prohibited'],
            'execution_street' => ['prohibited'],
            'execution_number' => ['prohibited'],
            'execution_complement' => ['prohibited'],
            'execution_neighborhood' => ['prohibited'],
            'execution_city' => ['prohibited'],
            'execution_state' => ['prohibited'],
            'execution_reference_point' => ['prohibited'],
            'contact_name' => ['prohibited'],
            'contact_role' => ['prohibited'],
            'contact_department' => ['prohibited'],
            'contact_phone' => ['prohibited'],
            'contact_whatsapp' => ['prohibited'],
            'contact_email' => ['prohibited'],
            'started_at' => ['prohibited'],
            'completed_at' => ['prohibited'],
            'cancelled_at' => ['prohibited'],
            'cancellation_reason' => ['prohibited'],

            'customer_id' => ['required', 'string'],
            'customer_address_id' => ['required', 'string'],
            'customer_contact_id' => ['nullable', 'string'],
            'responsible_user_id' => ['nullable', 'string'],

            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],

            'scheduled_start_at' => ['nullable', 'date'],
            'scheduled_end_at' => ['nullable', 'date'],

            'order_discount' => ['nullable', 'numeric', 'min:0'],
            'travel_fee' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateCustomerAddressAndContact($validator);
            $this->validateResponsibleUserIsMember($validator);
            $this->validateSchedule($validator);
        });
    }
}
