<?php

namespace App\Support\Facades;

use App\Support\CurrentCompanyContext;
use Illuminate\Support\Facades\Facade;

/**
 * @method static void set(\App\Models\Company $company)
 * @method static void clear()
 * @method static bool has()
 * @method static \App\Models\Company get()
 * @method static string id()
 * @method static mixed run(\App\Models\Company $company, callable $callback)
 *
 * @see CurrentCompanyContext
 */
class CurrentCompany extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return CurrentCompanyContext::class;
    }
}
