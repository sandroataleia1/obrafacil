<?php

namespace App\Http\Resources;

use App\Models\Company;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * GET/PUT /api/v1/company/profile (+ the logo upload/delete endpoints,
 * which also return this same shape). §6: `logo_path` is never exposed —
 * only a derived `logo_url` (§14), so the storage layout/disk stays free
 * to change later without breaking any client that has this response
 * shape memorized.
 *
 * @property Company $resource
 */
class CompanyProfileResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'legal_name' => $this->legal_name,
            'trade_name' => $this->trade_name,
            'document' => $this->document,

            'phone' => $this->phone,
            'whatsapp' => $this->whatsapp,
            'email' => $this->email,

            'address' => [
                'postal_code' => $this->postal_code,
                'street' => $this->street,
                'number' => $this->number,
                'complement' => $this->complement,
                'neighborhood' => $this->neighborhood,
                'city' => $this->city,
                'state' => $this->state,
                'reference_point' => $this->reference_point,
            ],

            'timezone' => $this->timezone,

            'logo_url' => $this->logo_path ? Storage::disk('public')->url($this->logo_path) : null,

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
