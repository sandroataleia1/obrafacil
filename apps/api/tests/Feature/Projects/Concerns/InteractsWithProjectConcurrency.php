<?php

namespace Tests\Feature\Projects\Concerns;

use App\Models\Company;
use Symfony\Component\Process\Process;

/**
 * PROJECT-API-01 §63-64. Drives `App\Console\Commands\ProjectConcurrencyProbe`
 * as genuinely separate OS processes/PostgreSQL connections (via
 * `Symfony\Component\Process\Process`) — never simulates concurrency by
 * calling Service methods sequentially in-process. Test classes using
 * this trait MUST use `DatabaseTruncation`, never `RefreshDatabase`:
 * RefreshDatabase wraps the whole test in one uncommitted transaction on
 * the test process's own connection, which a genuinely separate probe
 * process/connection would never be able to see. Mirrors
 * InteractsWithServiceOrderConcurrency/InteractsWithBudgetConcurrency.
 */
trait InteractsWithProjectConcurrency
{
    /**
     * @param  array<string, mixed>  $options
     */
    protected function startProjectConcurrencyProbe(Company $company, string $project, string $action, array $options = []): Process
    {
        $command = ['php', 'artisan', 'concurrency:project', $company->id, $project, $action];
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
    protected function waitForProjectProbe(Process $process): array
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
    protected function waitForProjectProbes(array $processes): array
    {
        return array_map(fn (Process $process) => $this->waitForProjectProbe($process), $processes);
    }
}
