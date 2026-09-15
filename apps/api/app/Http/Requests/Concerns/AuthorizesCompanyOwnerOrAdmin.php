<?php

namespace App\Http\Requests\Concerns;

use App\Enums\CompanyRole;
use App\Support\CurrentCompanyContext;

/**
 * COMPANY-PROFILE-API-01 §8: mutating the Company profile (header fields or
 * logo) is restricted to the current company's owner/admin — a plain
 * member gets 403. The role is never trusted from the request payload; it
 * is always re-derived from the authenticated user's own membership row
 * for the company already resolved by `resolve-current-company`
 * middleware (never a company id from the request itself).
 */
trait AuthorizesCompanyOwnerOrAdmin
{
    public function authorize(): bool
    {
        $user = $this->user();

        if ($user === null) {
            return false;
        }

        $companyId = app(CurrentCompanyContext::class)->id();
        $membership = $user->memberships()->where('company_id', $companyId)->first();

        return $membership !== null && in_array($membership->role, [CompanyRole::Owner, CompanyRole::Admin], true);
    }
}
