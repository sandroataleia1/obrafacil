<?php

namespace App\Notifications\Support;

/**
 * The known event-type registry (Gate BACKEND-03 §21). This is a PHP-level
 * catalog for type safety in code — the `notification_events.type` DB
 * column stays a plain string on purpose, since new types will be added
 * often and a DB enum would need a migration for every one.
 *
 * None of the domains below (ServiceOrder, Payable, ...) exist yet — these
 * cases are the vocabulary the notification engine understands, not proof
 * those features are implemented. `SystemTest` is the one case actually
 * used this round, to exercise the full pipeline end to end without
 * inventing a real domain.
 */
enum NotificationEventType: string
{
    case SystemTest = 'system.test';

    case ServiceOrderCreated = 'service_order.created';
    case ServiceOrderDueTomorrow = 'service_order.due_tomorrow';
    case ServiceOrderDueToday = 'service_order.due_today';
    case ServiceOrderOverdue = 'service_order.overdue';
    case ServiceOrderCompleted = 'service_order.completed';

    case PayableDueIn7Days = 'payable.due_in_7_days';
    case PayableDueIn3Days = 'payable.due_in_3_days';
    case PayableDueTomorrow = 'payable.due_tomorrow';
    case PayableDueToday = 'payable.due_today';
    case PayableOverdue = 'payable.overdue';
    case PayablePaid = 'payable.paid';

    case ReceivableDueTomorrow = 'receivable.due_tomorrow';
    case ReceivableDueToday = 'receivable.due_today';
    case ReceivableOverdue = 'receivable.overdue';
    case ReceivableReceived = 'receivable.received';

    case ProjectDeadlineApproaching = 'project.deadline_approaching';
    case ProjectOverdue = 'project.overdue';
    case ProjectCostOverrun = 'project.cost_overrun';

    case PurchaseDeliveryToday = 'purchase.delivery_today';
    case PurchaseDeliveryOverdue = 'purchase.delivery_overdue';

    case StockShortage = 'stock.shortage';

    case TeamPeriodPending = 'team.period_pending';

    case SummaryDaily = 'summary.daily';
    case SummaryWeekly = 'summary.weekly';

    /**
     * Metadata only — nothing in this round reads this to bypass quiet
     * hours (§25: "default: não bypass"). It exists so a future gate can
     * wire a bypass without redesigning the registry.
     */
    public function isCritical(): bool
    {
        return false;
    }
}
