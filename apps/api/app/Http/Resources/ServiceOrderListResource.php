<?php

namespace App\Http\Resources;

use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * §60. The lean shape for GET /service-orders — enough for a list UI
 * without loading/serializing items or the full snapshot. `company_id` is
 * never exposed (§60/§14).
 *
 * @property ServiceOrder $resource
 */
class ServiceOrderListResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->formattedNumber(),
            'status' => $this->status->value,
            'title' => $this->title,
            'customer' => [
                'id' => $this->customer_id,
                'name' => $this->customer_name,
            ],
            'execution_address' => [
                'label' => $this->execution_address_label,
                'city' => $this->execution_city,
                'state' => $this->execution_state,
            ],
            'contact' => $this->contact_name !== null ? [
                'name' => $this->contact_name,
                'role' => $this->contact_role,
            ] : null,
            'scheduled_start_at' => $this->scheduled_start_at,
            'subtotal' => $this->subtotal,
            'order_discount' => $this->order_discount,
            'travel_fee' => $this->travel_fee,
            'total' => $this->total,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
