<?php

namespace App\Http\Resources;

use App\Lookups\Support\CompanyRegistryLookupResult;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property CompanyRegistryLookupResult $resource
 */
class CompanyRegistryLookupResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'document' => $this->resource->document,
            'legal_name' => $this->resource->legalName,
            'trade_name' => $this->resource->tradeName,
            'phone' => $this->resource->phone,
            'email' => $this->resource->email,
            'address' => [
                'postal_code' => $this->resource->address->postalCode,
                'street' => $this->resource->address->street,
                'number' => $this->resource->address->number,
                'complement' => $this->resource->address->complement,
                'neighborhood' => $this->resource->address->neighborhood,
                'city' => $this->resource->address->city,
                'state' => $this->resource->address->state,
            ],
        ];
    }
}
