<?php

namespace App\Lookups\Support;

/**
 * The internal, provider-agnostic shape of a successful CNPJ lookup —
 * never BrasilAPI's own field names (§3/§5). Deliberately excludes
 * partners/capital social/CNAEs/tax regime — none of that is useful for
 * Customer registration, and none of it is imported into this contract.
 */
final class CompanyRegistryLookupResult
{
    public function __construct(
        public readonly string $document,
        public readonly string $legalName,
        public readonly ?string $tradeName,
        public readonly ?string $phone,
        public readonly ?string $email,
        public readonly CompanyRegistryAddress $address,
    ) {}
}
