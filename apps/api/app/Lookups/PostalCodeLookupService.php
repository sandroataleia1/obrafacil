<?php

namespace App\Lookups;

use App\Lookups\Contracts\PostalCodeProvider;
use App\Lookups\Support\PostalCodeLookupResult;
use Illuminate\Support\Facades\Cache;

/**
 * §26-28: cache is keyed purely by the canonical CEP — never by
 * user/company, since a postal code's address data is public and
 * identical for every tenant. Only a *successful* result is ever cached
 * (§27) — an exception always propagates before Cache::put is reached, so
 * a timeout/5xx/invalid response is never remembered as if it were real
 * data.
 */
class PostalCodeLookupService
{
    public function __construct(private readonly PostalCodeProvider $provider) {}

    /**
     * @param  string  $postalCode  Canonical, already-validated 8-digit CEP.
     */
    public function lookup(string $postalCode): PostalCodeLookupResult
    {
        $cacheKey = "lookups:cep:{$postalCode}";

        $cached = Cache::get($cacheKey);
        if ($cached instanceof PostalCodeLookupResult) {
            return $cached;
        }

        $result = $this->provider->lookup($postalCode);

        Cache::put($cacheKey, $result, (int) config('lookups.cache.cep_ttl'));

        return $result;
    }
}
