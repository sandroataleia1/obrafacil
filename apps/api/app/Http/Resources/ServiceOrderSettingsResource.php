<?php

namespace App\Http\Resources;

use App\Models\ServiceOrderSetting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * §32/§33. `company_id` is never exposed.
 *
 * @property ServiceOrderSetting $resource
 */
class ServiceOrderSettingsResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'default_travel_fee' => $this->default_travel_fee,
        ];
    }
}
