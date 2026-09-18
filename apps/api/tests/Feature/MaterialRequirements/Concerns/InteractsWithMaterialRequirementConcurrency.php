<?php

namespace Tests\Feature\MaterialRequirements\Concerns;

use App\Models\Company;
use Symfony\Component\Process\Process;

/**
 * SUPPLY-API-01B §42. Drives App\Console\Commands\MaterialRequirementConcurrencyProbe
 * as genuinely separate OS processes/PostgreSQL connections — never
 * simulates concurrency by calling Service methods sequentially in-process.
 * Test classes using this trait MUST use DatabaseTruncation, never
 * RefreshDatabase — mirrors InteractsWithProjectConcurrency exactly.
 */
trait InteractsWithMaterialRequirementConcurrency
{
    /**
     * @param  array<string, mixed>  $options
     */
    protected function startMaterialRequirementConcurrencyProbe(Company $company, string $project, array $options = []): Process
    {
        $command = ['php', 'artisan', 'concurrency:material-requirement', $company->id, $project];
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
    protected function waitForMaterialRequirementProbe(Process $process): array
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
    protected function waitForMaterialRequirementProbes(array $processes): array
    {
        return array_map(fn (Process $process) => $this->waitForMaterialRequirementProbe($process), $processes);
    }
}
