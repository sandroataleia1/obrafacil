<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// BACKEND-06A §21/§34: reminder + reconciliation scanner for ServiceOrder
// notifications. Every 5 minutes, `withoutOverlapping()` so a slow run
// (many companies/O.S.) never stacks a second concurrent run on top of
// itself — the command is idempotent either way (deterministic
// deduplication keys, §27/§37), this is purely to avoid wasted work.
// This worker/scheduler is not started in this round (§34: "Worker/
// scheduler de produção só será ligado na fase final de deploy") — this
// only registers the schedule definition itself.
Schedule::command('notifications:service-orders')
    ->everyFiveMinutes()
    ->withoutOverlapping();
