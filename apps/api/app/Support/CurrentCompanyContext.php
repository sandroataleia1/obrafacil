<?php

namespace App\Support;

use App\Models\Company;
use RuntimeException;

/**
 * Holds the single company that business queries are scoped to for the
 * duration of the current request, console command, or job.
 *
 * There is no implicit fallback to "no company" behaving as "all
 * companies" anywhere in this class — every accessor that doesn't find a
 * company set throws instead of silently doing nothing.
 */
class CurrentCompanyContext
{
    protected ?Company $company = null;

    public function set(Company $company): void
    {
        $this->company = $company;
    }

    public function clear(): void
    {
        $this->company = null;
    }

    public function has(): bool
    {
        return $this->company !== null;
    }

    public function get(): Company
    {
        if ($this->company === null) {
            throw new RuntimeException(
                'No current company context is set. Business models require an active '.
                'company (via ResolveCurrentCompany middleware in HTTP, or CurrentCompanyContext::run() '.
                'in console/job contexts) before they can be queried or created.'
            );
        }

        return $this->company;
    }

    public function id(): string
    {
        return $this->get()->id;
    }

    /**
     * Run a callback with the given company set as current, restoring the
     * previous value (if any) afterwards. This is the required entry point
     * for tests, seeders, commands, and jobs — none of them should rely on
     * an authenticated HTTP request to establish tenant context.
     *
     * @template TReturn
     *
     * @param  callable(): TReturn  $callback
     * @return TReturn
     */
    public function run(Company $company, callable $callback): mixed
    {
        $previous = $this->company;
        $this->company = $company;

        try {
            return $callback();
        } finally {
            $this->company = $previous;
        }
    }
}
