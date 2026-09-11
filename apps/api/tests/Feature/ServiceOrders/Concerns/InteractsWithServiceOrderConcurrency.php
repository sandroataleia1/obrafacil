<?php

namespace Tests\Feature\ServiceOrders\Concerns;

use App\Models\Company;
use App\Models\ServiceOrder;
use App\Models\ServiceOrderItem;
use Symfony\Component\Process\Process;

/**
 * BACKEND-06B §22-23. Drives `App\Console\Commands\ServiceOrderConcurrencyProbe`
 * as genuinely separate OS processes/PostgreSQL connections (via
 * `Symfony\Component\Process\Process`) — never simulates concurrency by
 * calling Service methods sequentially in-process. Test classes using
 * this trait MUST use `DatabaseTruncation`, never `RefreshDatabase`:
 * RefreshDatabase wraps the whole test in one uncommitted transaction on
 * the test process's own connection, which a genuinely separate probe
 * process/connection would never be able to see (a second real backend
 * connection cannot observe another connection's uncommitted writes).
 */
trait InteractsWithServiceOrderConcurrency
{
    /**
     * @param  array<string, mixed>  $options
     */
    protected function startConcurrencyProbe(Company $company, ServiceOrder $order, string $action, array $options = []): Process
    {
        $command = ['php', 'artisan', 'concurrency:service-order', $company->id, $order->id, $action];
        foreach ($options as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $command[] = "--{$key}={$value}";
        }

        // Mirrors phpunit.xml's forced test DB exactly — read back from
        // the already-resolved config (this process booted under the
        // same forced <server> values), never re-derived independently,
        // so the probe can never accidentally point at the dev database.
        $env = [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => 'pgsql',
            'DB_HOST' => (string) config('database.connections.pgsql.host'),
            'DB_PORT' => (string) config('database.connections.pgsql.port'),
            'DB_DATABASE' => (string) config('database.connections.pgsql.database'),
            'DB_USERNAME' => (string) config('database.connections.pgsql.username'),
            'DB_PASSWORD' => (string) config('database.connections.pgsql.password'),
            'CACHE_STORE' => 'array',
            'SESSION_DRIVER' => 'array',
            'QUEUE_CONNECTION' => 'sync',
        ];

        $process = new Process($command, base_path(), $env);
        $process->setTimeout(30);
        $process->start();

        return $process;
    }

    /**
     * @return array<string, mixed>
     */
    protected function waitForProbe(Process $process): array
    {
        $process->wait();

        $stdout = trim($process->getOutput());
        $lines = array_values(array_filter(explode("\n", $stdout)));
        $last = end($lines);
        $decoded = $last === false ? null : json_decode($last, true);

        if (! is_array($decoded)) {
            self::fail(sprintf(
                "Concurrency probe produced no parseable JSON.\nExit code: %s\nstdout: %s\nstderr: %s",
                $process->getExitCode(),
                $stdout,
                $process->getErrorOutput()
            ));
        }

        return $decoded;
    }

    /**
     * Convenience for the common "start both, wait both" shape — both
     * probes are already running concurrently the moment this returns
     * (Process::start() is non-blocking), `wait()` just polls each one's
     * own completion and does not hold up the other.
     *
     * @param  array<Process>  $processes
     * @return array<array<string, mixed>>
     */
    protected function waitForProbes(array $processes): array
    {
        return array_map(fn (Process $process) => $this->waitForProbe($process), $processes);
    }

    /**
     * §24. The financial invariant every concurrent scenario must satisfy
     * once all transactions have settled: subtotal is exactly the sum of
     * the current items' line_total, and total is exactly
     * subtotal - order_discount + travel_fee. Uses bcmath directly (not
     * App\ServiceOrders\Money) so this assertion doesn't share a bug with
     * the production code it's checking.
     */
    protected function assertServiceOrderInvariants(Company $company, string $orderId): void
    {
        $this->currentCompanyContext()->run($company, function () use ($orderId) {
            $order = ServiceOrder::query()->findOrFail($orderId);

            $sum = '0.00';
            foreach (ServiceOrderItem::query()->where('service_order_id', $orderId)->get() as $item) {
                $sum = bcadd($sum, (string) $item->line_total, 2);
            }

            $this->assertSame($sum, (string) $order->subtotal, 'subtotal must equal SUM(service_order_items.line_total)');

            $expectedTotal = bcadd(bcsub((string) $order->subtotal, (string) $order->order_discount, 2), (string) $order->travel_fee, 2);
            $this->assertSame($expectedTotal, (string) $order->total, 'total must equal subtotal - order_discount + travel_fee');
        });
    }
}
