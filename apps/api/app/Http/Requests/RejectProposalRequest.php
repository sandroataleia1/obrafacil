<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUBLIC POST /api/v1/proposals/{token}/reject — no auth, `name` is how
 * the decision is attributed. `reason` is optional free text.
 */
class RejectProposalRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
