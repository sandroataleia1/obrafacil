<?php

namespace Tests\Feature\Companies\Concerns;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Laravel\Sanctum\Sanctum;

trait InteractsWithCompanyProfile
{
    protected function currentCompanyContext(): CurrentCompanyContext
    {
        return app(CurrentCompanyContext::class);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    protected function makeCompanyWithMember(
        array $companyAttributes = [],
        array $userAttributes = [],
        CompanyRole $role = CompanyRole::Owner,
    ): array {
        $company = Company::factory()->create($companyAttributes);
        $user = User::factory()->create($userAttributes);
        $company->memberships()->create(['user_id' => $user->id, 'role' => $role]);

        return [$company, $user];
    }

    /**
     * @return array{0: Company, 1: User}
     */
    protected function actingAsNewCompanyMember(
        array $companyAttributes = [],
        array $userAttributes = [],
        CompanyRole $role = CompanyRole::Owner,
    ): array {
        [$company, $user] = $this->makeCompanyWithMember($companyAttributes, $userAttributes, $role);
        Sanctum::actingAs($user);

        return [$company, $user];
    }
}
