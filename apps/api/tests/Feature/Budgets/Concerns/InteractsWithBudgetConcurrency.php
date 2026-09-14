<?php

namespace Tests\Feature\Budgets\Concerns;

use App\Models\Budget;
use App\Models\BudgetItem;
use App\Models\Company;
use Symfony\Component\Process\Process;

/**
 * BUDGET-API-01 §66. Drives `App\Console\Commands\BudgetConcurrencyProbe`
 * as genuinely separate OS processes/PostgreSQL connections — mirrors
 * `Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrderConcurrency`
 * exactly. Test classes using this trait MUST use `DatabaseTruncation`,
 * never `RefreshDatabase`.
 */
trait InteractsWithBudgetConcurrency
{
    /**
     * @param  array<string, mixed>  $options
     */
    protected function startBudgetConcurrencyProbe(Company $company, Budget|string $budget, string $action, array $options = []): Process
    {
        $budgetId = $budget instanceof Budget ? $budget->id : $budget;
        $command = ['php', 'artisan', 'concurrency:budget', $company->id, $budgetId, $action];
        foreach ($options as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $command[] = "--{$key}={$value}";
        }

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
    protected function waitForBudgetProbe(Process $process): array
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
     * @param  array<Process>  $processes
     * @return array<array<string, mixed>>
     */
    protected function waitForBudgetProbes(array $processes): array
    {
        return array_map(fn (Process $process) => $this->waitForBudgetProbe($process), $processes);
    }

    /**
     * The financial invariant every concurrent scenario must satisfy once
     * all transactions have settled: sale_subtotal is exactly the sum of
     * the current items' line_total, and total is exactly
     * sale_subtotal - discount_amount. Uses bcmath directly (not
     * App\Budgets\Money) so this assertion doesn't share a bug with the
     * production code it's checking.
     */
    protected function assertBudgetInvariants(Company $company, string $budgetId): void
    {
        $this->currentCompanyContext()->run($company, function () use ($budgetId) {
            $budget = Budget::query()->findOrFail($budgetId);

            $sum = '0.00';
            foreach (BudgetItem::query()->where('budget_id', $budgetId)->get() as $item) {
                $sum = bcadd($sum, (string) $item->line_total, 2);
            }

            $this->assertSame($sum, (string) $budget->sale_subtotal, 'sale_subtotal must equal SUM(budget_items.line_total)');

            $expectedTotal = bcsub((string) $budget->sale_subtotal, (string) $budget->discount_amount, 2);
            $this->assertSame($expectedTotal, (string) $budget->total, 'total must equal sale_subtotal - discount_amount');
        });
    }
}
