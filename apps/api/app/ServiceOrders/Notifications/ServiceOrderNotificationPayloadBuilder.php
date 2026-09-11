<?php

namespace App\ServiceOrders\Notifications;

use App\Models\ServiceOrder;

/**
 * BACKEND-06A §13/§14. The one place a ServiceOrder is turned into a
 * NotificationEvent payload — reused by both the transactional lifecycle
 * bridge (ServiceOrderNotificationBridge) and the reminder/reconciliation
 * scanner, so the two paths can never drift into different shapes.
 *
 * Deliberately excludes `customer_document`/`customer_phone`/
 * `contact_phone`/`contact_whatsapp` and anything else personally
 * identifying beyond what an internal operational alert needs to
 * identify *which* O.S. it's about (§14) — this is an internal-staff
 * alert, not a copy of the customer's file.
 *
 * `company_timezone` travels in the payload (not resolved by the
 * renderer) because NotificationMessageRenderer has zero DB/Company
 * dependency by design (see NotificationDispatcher's docblock) — every
 * human-readable, timezone-aware date string is computed by the renderer
 * from this raw ISO instant + this timezone string, never from a live
 * Company/Carbon-in-server-timezone value.
 */
class ServiceOrderNotificationPayloadBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(ServiceOrder $order, string $companyTimezone): array
    {
        return [
            'service_order_id' => $order->id,
            'number' => $order->formattedNumber(),
            'title' => $order->title,
            'status' => $order->status->value,
            'customer_name' => $order->customer_name,

            'execution_address_label' => $order->execution_address_label,
            'execution_city' => $order->execution_city,
            'execution_state' => $order->execution_state,

            'contact_name' => $order->contact_name,
            'contact_role' => $order->contact_role,

            'scheduled_start_at' => $order->scheduled_start_at?->toIso8601String(),
            'company_timezone' => $companyTimezone,

            'subtotal' => (string) $order->subtotal,
            'travel_fee' => (string) $order->travel_fee,
            'total' => (string) $order->total,

            'cancellation_reason' => $order->cancellation_reason,
        ];
    }
}
