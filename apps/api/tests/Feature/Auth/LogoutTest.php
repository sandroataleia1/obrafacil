<?php

namespace Tests\Feature\Auth;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use App\Support\ActiveCompanySession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /** A5: Logout invalidates the session — a subsequent /me is unauthenticated. */
    public function test_logout_invalidates_the_session(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($user, 'correct-password')->assertOk();

        $logoutResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/logout');
        $logoutResponse->assertNoContent();
        $this->carryCookiesFrom($logoutResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')->assertStatus(401);
    }

    /** A18: Logout removes the active company from the session. */
    public function test_logout_removes_active_company(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($user, 'correct-password')->assertJsonPath('active_company.id', $company->id);

        $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/logout')->assertNoContent();

        $this->assertNull(ActiveCompanySession::get());
    }
}
