<?php

namespace App\Support;

use App\Models\User;

/**
 * Shared response shape for both POST /api/v1/login and GET /api/v1/me, so
 * the frontend gets the exact same "who am I / which company(ies) can I
 * use / do I need to pick one" contract from either endpoint.
 *
 * Read-only: never writes to the session. When there is exactly one
 * membership, that company is presented as active even if nothing has
 * explicitly been stored in session yet (there is no ambiguity to resolve),
 * but nothing is persisted here — ResolveCurrentCompany is the only place
 * that writes the auto-resolved company to the session, and only when a
 * business route is actually touched.
 */
class MePayload
{
    /**
     * @return array<string, mixed>
     */
    public static function build(User $user): array
    {
        $memberships = $user->memberships()->with('company')->get();

        $activeMembership = match (true) {
            $memberships->count() === 1 => $memberships->first(),
            default => ($id = ActiveCompanySession::get()) !== null
                ? $memberships->firstWhere('company_id', $id)
                : null,
        };

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
            ],
            'memberships' => $memberships->map(fn ($membership) => [
                'company' => [
                    'id' => $membership->company->id,
                    'name' => $membership->company->name,
                ],
                'role' => $membership->role->value,
            ])->all(),
            'active_company' => $activeMembership !== null ? [
                'id' => $activeMembership->company->id,
                'name' => $activeMembership->company->name,
            ] : null,
            'requires_company_selection' => $memberships->count() > 1 && $activeMembership === null,
        ];
    }
}
