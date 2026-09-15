<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesCompanyOwnerOrAdmin;
use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /api/v1/company/profile/logo — owner/admin only (§11). No body.
 */
class DestroyCompanyLogoRequest extends FormRequest
{
    use AuthorizesCompanyOwnerOrAdmin;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
