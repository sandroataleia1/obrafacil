<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Evolution API (WhatsApp provider)
    |--------------------------------------------------------------------------
    |
    | Private, server-side only — never exposed to apps/web, never a
    | NEXT_PUBLIC_* value, and no real key belongs in the repository. Only
    | .env.example carries placeholders. EVOLUTION-01 audits the actually
    | installed VPS version before any of these point at a real instance.
    |
    */

    'base_url' => env('EVOLUTION_API_URL'),

    'api_key' => env('EVOLUTION_API_KEY'),

    'instance' => env('EVOLUTION_INSTANCE'),

    'timeout_seconds' => (int) env('EVOLUTION_TIMEOUT_SECONDS', 10),

    'webhook_secret' => env('EVOLUTION_WEBHOOK_SECRET'),

];
