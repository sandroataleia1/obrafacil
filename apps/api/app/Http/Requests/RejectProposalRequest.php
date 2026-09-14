<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUBLIC POST /api/v1/proposals/{token}/reject — no auth, `name` is how
 * the decision is attributed. `note` (BUDGET-API-01A §27 — renamed from
 * `reason`, no alias kept: no real frontend consumes this API yet, so
 * there is no reason to carry two public names for the same
 * `decision_note` field) is optional free text.
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
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
