<?php

namespace App\Lookups\Contracts;

use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Support\PostalCodeLookupResult;

/**
 * No caller of this interface ever knows which provider answers it —
 * ViaCEP is one implementation, never a name that leaks into the Customer
 * domain or the controller layer (§3/§40).
 */
interface PostalCodeProvider
{
    /**
     * @param  string  $postalCode  Canonical, already-validated 8-digit CEP.
     *
     * @throws LookupNotFoundException
     * @throws LookupUnavailableException
     * @throws LookupInvalidResponseException
     */
    public function lookup(string $postalCode): PostalCodeLookupResult;
}
