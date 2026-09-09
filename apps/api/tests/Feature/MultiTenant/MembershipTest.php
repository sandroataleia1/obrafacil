<?php

namespace Tests\Feature\MultiTenant;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MembershipTest extends TestCase
{
    use RefreshDatabase;

    /** T1: Company uses UUID. */
    public function test_company_uses_uuid_primary_key(): void
    {
        $company = Company::factory()->create();

        $this->assertTrue(Str::isUuid($company->id));
    }

    /** T2: User uses UUID. */
    public function test_user_uses_uuid_primary_key(): void
    {
        $user = User::factory()->create();

        $this->assertTrue(Str::isUuid($user->id));
    }

    /** T3: Membership relates User <-> Company. */
    public function test_membership_relates_user_and_company(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create();

        $membership = $company->memberships()->create([
            'user_id' => $user->id,
            'role' => CompanyRole::Owner,
        ]);

        $this->assertTrue($membership->company->is($company));
        $this->assertTrue($membership->user->is($user));
        $this->assertTrue($user->companies->first()->is($company));
        $this->assertSame(CompanyRole::Owner, $user->memberships->first()->role);
    }

    /** T4: Duplicate membership for the same (company, user) pair is rejected. */
    public function test_duplicate_membership_is_rejected(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create();

        $company->memberships()->create([
            'user_id' => $user->id,
            'role' => CompanyRole::Owner,
        ]);

        $this->expectException(QueryException::class);

        $company->memberships()->create([
            'user_id' => $user->id,
            'role' => CompanyRole::Member,
        ]);
    }
}
