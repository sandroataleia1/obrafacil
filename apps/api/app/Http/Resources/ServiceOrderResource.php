<?php

namespace App\Http\Resources;

use App\Models\ServiceOrder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * §61. The full shape for POST/GET/PUT of a single ServiceOrder — every
 * snapshot field, schedule, status timestamps, and items[]. `company_id`
 * is never exposed. `items` only serializes when eager-loaded
 * (`whenLoaded`) — never triggers a lazy N+1 load.
 *
 * @property ServiceOrder $resource
 */
class ServiceOrderResource extends JsonResource
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

            'customer_id' => $this->customer_id,
            'customer_address_id' => $this->customer_address_id,
            'customer_contact_id' => $this->customer_contact_id,
            'responsible_user_id' => $this->responsible_user_id,

            'title' => $this->title,
            'description' => $this->description,

            'customer' => [
                'name' => $this->customer_name,
                'document' => $this->customer_document,
                'phone' => $this->customer_phone,
                'email' => $this->customer_email,
            ],

            'execution_address' => [
                'label' => $this->execution_address_label,
                'type' => $this->execution_address_type,
                'postal_code' => $this->execution_postal_code,
                'street' => $this->execution_street,
                'number' => $this->execution_number,
                'complement' => $this->execution_complement,
                'neighborhood' => $this->execution_neighborhood,
                'city' => $this->execution_city,
                'state' => $this->execution_state,
                'reference_point' => $this->execution_reference_point,
            ],

            'contact' => $this->contact_name !== null ? [
                'name' => $this->contact_name,
                'role' => $this->contact_role,
                'department' => $this->contact_department,
                'phone' => $this->contact_phone,
                'whatsapp' => $this->contact_whatsapp,
                'email' => $this->contact_email,
            ] : null,

            'scheduled_start_at' => $this->scheduled_start_at,
            'scheduled_end_at' => $this->scheduled_end_at,

            'started_at' => $this->started_at,
            'completed_at' => $this->completed_at,
            'cancelled_at' => $this->cancelled_at,
            'cancellation_reason' => $this->cancellation_reason,

            'subtotal' => $this->subtotal,
            'order_discount' => $this->order_discount,
            'travel_fee' => $this->travel_fee,
            'total' => $this->total,

            'notes' => $this->notes,

            'items' => ServiceOrderItemResource::collection($this->whenLoaded('items')),

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
