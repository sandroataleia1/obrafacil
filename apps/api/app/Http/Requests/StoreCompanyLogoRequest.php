<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\AuthorizesCompanyOwnerOrAdmin;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/v1/company/profile/logo — owner/admin only (§11). Accepts
 * only PNG/JPEG/WebP (never SVG — §11), max 2MB. `mimes` checks the
 * extension the upload claims; `mimetypes` additionally sniffs the real
 * content via fileinfo, so a renamed file (e.g. a `.png` that is actually
 * an SVG/script) is rejected on content, not just on its claimed name.
 */
class StoreCompanyLogoRequest extends FormRequest
{
    use AuthorizesCompanyOwnerOrAdmin;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'logo' => [
                'required',
                'file',
                'mimes:png,jpg,jpeg,webp',
                'mimetypes:image/png,image/jpeg,image/webp',
                'max:2048',
            ],
        ];
    }
}
