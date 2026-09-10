<?php

namespace App\Lookups;

use App\Lookups\Contracts\CompanyRegistryProvider;
use App\Lookups\Support\CompanyRegistryLookupResult;
use Illuminate\Support\Facades\Cache;

/**
 * §26-28: cache is keyed purely by the canonical CNPJ — never by
 * user/company, since a company's registry data is public and identical
 * for every tenant. Only a *successful* result is ever cached (§27).
 */
class CompanyRegistryLookupService
{
    public function __construct(private readonly CompanyRegistryProvider $provider) {}

    /**
     * @param  string  $document  Canonical, already-validated 14-digit CNPJ.
     */
    public function lookup(string $document): CompanyRegistryLookupResult
    {
        $cacheKey = "lookups:cnpj:{$document}";

        $cached = Cache::get($cacheKey);
        if ($cached instanceof CompanyRegistryLookupResult) {
            return $cached;
        }

        $result = $this->provider->lookup($document);

        Cache::put($cacheKey, $result, (int) config('lookups.cache.cnpj_ttl'));

        return $result;
    }
}
