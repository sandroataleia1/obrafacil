<?php

namespace App\ServiceOrders\Notifications;

/**
 * BACKEND-06A §7/§8/§27/§29-33. The single place every ServiceOrder
 * notification's deduplication key is formatted — shared by
 * ServiceOrderNotificationBridge (lifecycle events, fired right after
 * commit) and the reconciliation/reminder scanner (fired periodically),
 * so both paths always land on the exact same key for the same logical
 * occurrence. `NotificationDispatcher`'s real DB unique constraint on
 * `(company_id, deduplication_key)` is what actually makes duplicates
 * impossible (§37) — this class only has to be *consistent*, not itself
 * responsible for uniqueness.
 */
final class ServiceOrderNotificationDedupKey
{
    public static function created(string $orderId): string
    {
        return "service_order:{$orderId}:created";
    }

    public static function scheduled(string $orderId, string $scheduledStartAtIso): string
    {
        return "service_order:{$orderId}:scheduled:{$scheduledStartAtIso}";
    }

    public static function started(string $orderId): string
    {
        return "service_order:{$orderId}:started";
    }

    public static function completed(string $orderId): string
    {
        return "service_order:{$orderId}:completed";
    }

    public static function cancelled(string $orderId): string
    {
        return "service_order:{$orderId}:cancelled";
    }

    public static function dueTomorrow(string $orderId, string $scheduledStartAtIso): string
    {
        return "service_order:{$orderId}:due_tomorrow:{$scheduledStartAtIso}";
    }

    public static function dueToday(string $orderId, string $scheduledStartAtIso): string
    {
        return "service_order:{$orderId}:due_today:{$scheduledStartAtIso}";
    }

    public static function due2Hours(string $orderId, string $scheduledStartAtIso): string
    {
        return "service_order:{$orderId}:due_2_hours:{$scheduledStartAtIso}";
    }

    public static function overdue(string $orderId, string $scheduledStartAtIso): string
    {
        return "service_order:{$orderId}:overdue:{$scheduledStartAtIso}";
    }
}
