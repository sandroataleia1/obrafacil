<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/service-orders/settings — §33. `company_id` is never read
 * from the request — ServiceOrderSettingsService always writes to the row
 * scoped by the active CurrentCompanyContext.
 */
class UpdateServiceOrderSettingsRequest extends FormRequest
{
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
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'default_travel_fee' => ['required', 'numeric', 'min:0'],
        ];
    }
}
