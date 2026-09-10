<?php

namespace App\Support;

/**
 * The 27 official Brazilian UF codes (26 states + Distrito Federal).
 * §22 — validated against this fixed set, never against an external
 * service.
 */
final class BrazilianStates
{
    public const array CODES = [
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
        'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
        'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
    ];
}
