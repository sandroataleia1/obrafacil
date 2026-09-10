<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET/POST/PUT /api/v1/customers/{customer} — full detail, including every
 * address and contact (§45/§87). List responses use CustomerListResource
 * instead, which never loads the full collections (§44/§88).
 *
 * @property Customer $resource
 */
class CustomerResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind->value,
            'name' => $this->name,
            'legal_name' => $this->legal_name,
            'trade_name' => $this->trade_name,
            'document' => $this->document,
            'phone' => $this->phone,
            'email' => $this->email,
            'notes' => $this->notes,
            'active' => $this->active,
            'addresses' => CustomerAddressResource::collection($this->whenLoaded('addresses')),
            'contacts' => CustomerContactResource::collection($this->whenLoaded('contacts')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
