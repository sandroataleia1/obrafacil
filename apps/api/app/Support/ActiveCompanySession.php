<?php

namespace App\Support;

/**
 * The single, explicit session key that holds the user's active company for
 * the current browser session. Deliberately NOT a cookie of its own — it
 * lives inside the server-side session (SESSION_DRIVER=database), same as
 * everything else Sanctum SPA manages.
 */
class ActiveCompanySession
{
    public const KEY = 'active_company_id';

    public static function get(): ?string
    {
        return session(self::KEY);
    }

    public static function set(string $companyId): void
    {
        session([self::KEY => $companyId]);
    }

    public static function forget(): void
    {
        session()->forget(self::KEY);
    }
}
