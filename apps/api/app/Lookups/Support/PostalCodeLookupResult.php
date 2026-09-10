<?php

namespace App\Lookups\Support;

/**
 * The internal, provider-agnostic shape of a successful CEP lookup —
 * never ViaCEP's own field names (§3/§4). `providerComplement` is
 * deliberately separate from a CustomerAddress' own `complement` (§13):
 * ViaCEP sometimes returns a locality hint (e.g. "lado ímpar") that must
 * never silently overwrite whatever the user already typed.
 */
final class PostalCodeLookupResult
{
    public function __construct(
        public readonly string $postalCode,
        public readonly ?string $street,
        public readonly ?string $neighborhood,
        public readonly ?string $city,
        public readonly ?string $state,
        public readonly ?string $providerComplement,
    ) {}
}
