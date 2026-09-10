<?php

namespace App\Http\Resources;

use App\Lookups\Support\PostalCodeLookupResult;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property PostalCodeLookupResult $resource
 */
class PostalCodeLookupResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'postal_code' => $this->resource->postalCode,
            'street' => $this->resource->street,
            'neighborhood' => $this->resource->neighborhood,
            'city' => $this->resource->city,
            'state' => $this->resource->state,
            'provider_complement' => $this->resource->providerComplement,
        ];
    }
}
