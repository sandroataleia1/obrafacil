<?php

namespace App\Lookups\Contracts;

use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Support\CompanyRegistryLookupResult;

/**
 * No caller of this interface ever knows which provider answers it —
 * BrasilAPI is one implementation, never a name that leaks into the
 * Customer domain or the controller layer (§3/§40).
 */
interface CompanyRegistryProvider
{
    /**
     * @param  string  $document  Canonical, already-validated 14-digit CNPJ.
     *
     * @throws LookupNotFoundException
     * @throws LookupUnavailableException
     * @throws LookupInvalidResponseException
     */
    public function lookup(string $document): CompanyRegistryLookupResult;
}
