<?php

namespace App\Http\Resources;

use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /api/v1/suppliers — SUPPLY-API-01A §26. A lean row per Supplier:
 * never `email`/`address`/`notes`/`created_at`, never `company_id`.
 *
 * @property Supplier $resource
 */
class SupplierListResource extends JsonResource
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
            'active' => $this->active,
            'updated_at' => $this->updated_at,
        ];
    }
}
