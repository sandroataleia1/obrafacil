<?php

namespace Tests\Unit\Notifications;

use App\Notifications\Support\NotificationDeliveryStatus as Status;
use PHPUnit\Framework\TestCase;

class NotificationDeliveryStatusTest extends TestCase
{
    public function test_happy_path_progression_is_allowed(): void
    {
        $this->assertTrue(Status::Queued->canTransitionTo(Status::Processing));
        $this->assertTrue(Status::Processing->canTransitionTo(Status::Sent));
        $this->assertTrue(Status::Sent->canTransitionTo(Status::Delivered));
        $this->assertTrue(Status::Delivered->canTransitionTo(Status::Read));
    }

    public function test_skipping_ahead_is_allowed(): void
    {
        $this->assertTrue(Status::Sent->canTransitionTo(Status::Read));
        $this->assertTrue(Status::Queued->canTransitionTo(Status::Delivered));
    }

    public function test_backward_movement_is_never_allowed(): void
    {
        $this->assertFalse(Status::Delivered->canTransitionTo(Status::Sent));
        $this->assertFalse(Status::Read->canTransitionTo(Status::Delivered));
        $this->assertFalse(Status::Read->canTransitionTo(Status::Queued));
        $this->assertFalse(Status::Processing->canTransitionTo(Status::Queued));
    }

    public function test_repeating_the_same_status_is_always_a_no_op_success(): void
    {
        foreach (Status::cases() as $status) {
            $this->assertTrue($status->canTransitionTo($status), "{$status->value} -> itself should be allowed");
        }
    }

    public function test_failure_is_reachable_from_any_non_terminal_state(): void
    {
        $this->assertTrue(Status::Queued->canTransitionTo(Status::Failed));
        $this->assertTrue(Status::Processing->canTransitionTo(Status::Failed));
        $this->assertTrue(Status::Sent->canTransitionTo(Status::Failed));
        $this->assertTrue(Status::Delivered->canTransitionTo(Status::Failed));
    }

    public function test_read_and_skipped_are_final(): void
    {
        $this->assertFalse(Status::Read->canTransitionTo(Status::Failed));
        $this->assertFalse(Status::Skipped->canTransitionTo(Status::Sent));
        $this->assertFalse(Status::Skipped->canTransitionTo(Status::Failed));
    }

    public function test_failed_only_progresses_via_explicit_requeue(): void
    {
        $this->assertTrue(Status::Failed->canTransitionTo(Status::Queued));
        $this->assertFalse(Status::Failed->canTransitionTo(Status::Sent));
        $this->assertFalse(Status::Failed->canTransitionTo(Status::Processing));
    }
}
