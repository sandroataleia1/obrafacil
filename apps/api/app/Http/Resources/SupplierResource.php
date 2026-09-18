<?php

namespace App\Http\Resources;

use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET/POST/PUT /api/v1/suppliers/{supplier} — SUPPLY-API-01A §26. The
 * detail shape (list + `email`/`address`/`notes`/`created_at`).
 * `company_id` never exposed.
 *
 * @property Supplier $resource
 */
class SupplierResource extends JsonResource
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
            'document' => $this->document,
            'contact_name' => $this->contact_name,
            'phone' => $this->phone,
            'email' => $this->email,
            'address' => $this->address,
            'notes' => $this->notes,
            'active' => $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
