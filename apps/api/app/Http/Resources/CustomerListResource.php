<?php

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * GET /api/v1/customers — a lean row per customer (§44/§88): only the
 * primary address/contact, never the full collections (avoids loading
 * every address/contact of every customer on a page just to render a
 * list).
 *
 * @property Customer $resource
 */
class CustomerListResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $primaryAddress = $this->addresses->first();
        $primaryContact = $this->contacts->first();

        return [
            'id' => $this->id,
            'kind' => $this->kind->value,
            'name' => $this->name,
            'legal_name' => $this->legal_name,
            'trade_name' => $this->trade_name,
            'document' => $this->document,
            'phone' => $this->phone,
            'email' => $this->email,
            'active' => $this->active,
            'primary_address' => $primaryAddress ? new CustomerAddressResource($primaryAddress) : null,
            'primary_contact' => $primaryContact ? new CustomerContactResource($primaryContact) : null,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
