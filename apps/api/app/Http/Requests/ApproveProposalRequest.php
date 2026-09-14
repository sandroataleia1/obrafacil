<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUBLIC POST /api/v1/proposals/{token}/approve — no auth, so `name` is
 * how the decision is attributed (`decision_by_name`). `accepted` must
 * be explicitly `true` — an approval is never inferred from merely
 * calling the endpoint. `note` (BUDGET-API-01A §26) is the single public
 * payload name for whatever becomes `decision_note` — never a second
 * name for the same thing.
 */
class ApproveProposalRequest extends FormRequest
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
            'accepted' => ['required', 'accepted'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
