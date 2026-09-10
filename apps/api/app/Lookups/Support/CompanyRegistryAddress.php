<?php

namespace App\Lookups\Support;

final class CompanyRegistryAddress
{
    public function __construct(
        public readonly ?string $postalCode,
        public readonly ?string $street,
        public readonly ?string $number,
        public readonly ?string $complement,
        public readonly ?string $neighborhood,
        public readonly ?string $city,
        public readonly ?string $state,
    ) {}
}
