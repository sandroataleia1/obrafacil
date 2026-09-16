<?php

namespace App\Http\Requests;

use App\Enums\ProjectStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/v1/projects — PROJECT-API-01 §41-43. Only search/status/page/
 * per_page enter v1 (§17 of the audit gate) — no other filter has a
 * documented real need yet.
 */
class ListProjectRequest extends FormRequest
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
            'search' => ['nullable', 'string'],
            'page' => ['nullable', 'integer', 'min:1'],
            // §41: the controller silently clamps an over-limit per_page
            // to 100 — not a validation error, so no upper-bound rule here.
            'per_page' => ['nullable', 'integer', 'min:1'],
            'status' => ['nullable', Rule::enum(ProjectStatus::class)],
        ];
    }
}
