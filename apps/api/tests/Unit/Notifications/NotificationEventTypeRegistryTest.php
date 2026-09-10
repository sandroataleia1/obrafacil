<?php

namespace Tests\Unit\Notifications;

use App\Notifications\Support\NotificationEventType;
use PHPUnit\Framework\TestCase;

/**
 * NOTIFICATIONS-API-01 §37 — E1-E8: the registry metadata that
 * NotificationSettingsService/Request build the whole preferences API on.
 */
class NotificationEventTypeRegistryTest extends TestCase
{
    /** E1: system.test is not user-configurable. */
    public function test_e1_system_test_is_not_user_configurable(): void
    {
        $this->assertFalse(NotificationEventType::SystemTest->isUserConfigurable());
    }

    /** E2: summary.daily is not generic-configurable. */
    public function test_e2_summary_daily_is_not_generic_configurable(): void
    {
        $this->assertFalse(NotificationEventType::SummaryDaily->isUserConfigurable());
    }

    /** E3: summary.weekly is not generic-configurable. */
    public function test_e3_summary_weekly_is_not_generic_configurable(): void
    {
        $this->assertFalse(NotificationEventType::SummaryWeekly->isUserConfigurable());
    }

    /** E4: service_order.scheduled exists. */
    public function test_e4_service_order_scheduled_exists(): void
    {
        $this->assertSame('service_order.scheduled', NotificationEventType::ServiceOrderScheduled->value);
    }

    /** E5: service_order.due_2_hours exists. */
    public function test_e5_service_order_due_2_hours_exists(): void
    {
        $this->assertSame('service_order.due_2_hours', NotificationEventType::ServiceOrderDue2Hours->value);
    }

    /** E6: service_order.started exists. */
    public function test_e6_service_order_started_exists(): void
    {
        $this->assertSame('service_order.started', NotificationEventType::ServiceOrderStarted->value);
    }

    /** E7: service_order.cancelled exists. */
    public function test_e7_service_order_cancelled_exists(): void
    {
        $this->assertSame('service_order.cancelled', NotificationEventType::ServiceOrderCancelled->value);
    }

    /** E8: group() returns the correct domain segment for every existing group. */
    public function test_e8_group_is_correct_for_existing_groups(): void
    {
        $this->assertSame('service_order', NotificationEventType::ServiceOrderCreated->group());
        $this->assertSame('payable', NotificationEventType::PayableDueToday->group());
        $this->assertSame('receivable', NotificationEventType::ReceivableDueToday->group());
        $this->assertSame('project', NotificationEventType::ProjectOverdue->group());
        $this->assertSame('purchase', NotificationEventType::PurchaseDeliveryToday->group());
        $this->assertSame('stock', NotificationEventType::StockShortage->group());
        $this->assertSame('team', NotificationEventType::TeamPeriodPending->group());
    }

    /** All user-configurable event types are also covered by group() producing a non-empty string. */
    public function test_every_user_configurable_event_type_has_a_group(): void
    {
        foreach (NotificationEventType::cases() as $type) {
            if (! $type->isUserConfigurable()) {
                continue;
            }

            $this->assertNotSame('', $type->group());
        }
    }
}
