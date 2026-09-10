<?php

/**
 * BACKEND-04A: config for the CEP/CNPJ lookup adapters. Base URLs are
 * server-side only, never NEXT_PUBLIC_* — the frontend never knows these
 * providers exist (§25/§31 — no user-suppliable URL, no proxy).
 */
return [
    'viacep' => [
        'base_url' => env('VIACEP_BASE_URL', 'https://viacep.com.br'),
    ],

    'brasilapi' => [
        'base_url' => env('BRASILAPI_BASE_URL', 'https://brasilapi.com.br/api'),
    ],

    'timeout_seconds' => (int) env('LOOKUP_HTTP_TIMEOUT', 5),

    'cache' => [
        // CEP data (street/neighborhood/city/state for a given postal
        // code) essentially never changes — a full day is a safe TTL.
        'cep_ttl' => (int) env('LOOKUP_CEP_CACHE_TTL', 86400),
        // CNPJ registry data (trade name, address, phone) can change more
        // often than a postal code (a company can move, rebrand, update
        // contact info) — a shorter, 6-hour TTL balances freshness against
        // still meaningfully reducing calls to the upstream provider.
        'cnpj_ttl' => (int) env('LOOKUP_CNPJ_CACHE_TTL', 21600),
    ],
];
