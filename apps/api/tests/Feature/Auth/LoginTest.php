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

class LoginTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /** A1: Valid login authenticates. */
    public function test_valid_login_authenticates(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);

        $response->assertOk();
        $this->assertAuthenticatedAs($user, 'web');
    }

    /** A2: Invalid login is rejected with a generic message, no existence leak. */
    public function test_invalid_login_is_rejected_with_generic_message(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);

        $wrongPassword = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $unknownEmail = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => 'nobody-'.uniqid().'@example.com',
            'password' => 'whatever-password',
        ]);

        $wrongPassword->assertStatus(422)->assertJson(['message' => 'These credentials do not match our records.']);
        $unknownEmail->assertStatus(422)->assertJson(['message' => 'These credentials do not match our records.']);

        $this->assertGuest('web');
    }

    /** A3: Rate limit on login (5/minute keyed by email + IP). */
    public function test_login_is_rate_limited(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);

        for ($i = 0; $i < 5; $i++) {
            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }

    /** A4: Session ID is regenerated on successful login (session fixation prevention). */
    public function test_successful_login_regenerates_the_session_id(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $preLogin = $this->withHeaders($this->statefulHeaders())->getJson('/sanctum/csrf-cookie');
        $idBeforeLogin = $this->decryptCookieValue($preLogin, config('session.cookie'));
        $this->assertNotNull($idBeforeLogin);

        $this->carryCookiesFrom($preLogin);

        $loginResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);
        $loginResponse->assertOk();

        $idAfterLogin = $this->decryptCookieValue($loginResponse, config('session.cookie'));

        $this->assertNotNull($idAfterLogin);
        $this->assertNotSame($idBeforeLogin, $idAfterLogin);
    }

    /** A10: A user with zero memberships gets a controlled 403 and no functional session. */
    public function test_login_with_zero_memberships_ends_with_no_functional_session(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);

        $response->assertStatus(403)->assertJson(['message' => 'No company is available for this user.']);
        $this->assertGuest('web');
        $this->assertNull(ActiveCompanySession::get());
    }

    /** A11: A user with exactly one membership gets that company auto-activated. */
    public function test_login_with_one_membership_auto_activates_that_company(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);

        $response->assertOk()
            ->assertJsonPath('active_company.id', $company->id)
            ->assertJsonPath('requires_company_selection', false);
    }

    /** A12: A user with more than one membership is authenticated but must select a company. */
    public function test_login_with_multiple_memberships_requires_selection(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);

        $response->assertOk()
            ->assertJsonPath('active_company', null)
            ->assertJsonPath('requires_company_selection', true)
            ->assertJsonCount(2, 'memberships');

        $this->assertAuthenticatedAs($user, 'web');
    }
}
