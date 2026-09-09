<?php

namespace Tests\Feature\Auth;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

class MeTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /** A6: /me without authentication returns 401. */
    public function test_me_without_auth_returns_401(): void
    {
        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')->assertStatus(401);
    }

    /** A7: /me while authenticated never leaks the password (or its hash). */
    public function test_me_authenticated_does_not_leak_password(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('correct-password'),
            'phone' => '+5511999999999',
        ]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($user, 'correct-password')->assertOk();

        $response = $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me');

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonPath('user.phone', '+5511999999999')
            ->assertJsonMissingPath('user.password')
            ->assertJsonMissingPath('user.remember_token');

        $this->assertStringNotContainsString('correct-password', $response->getContent());
        $this->assertStringNotContainsString($user->password, $response->getContent());
    }

    /** /me works for a user with >1 memberships without requiring an active company. */
    public function test_me_does_not_require_resolve_current_company(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password')->assertOk();

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('requires_company_selection', true)
            ->assertJsonPath('active_company', null);
    }
}
