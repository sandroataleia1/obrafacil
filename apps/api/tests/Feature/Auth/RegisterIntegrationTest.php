<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\ResolveCurrentCompany;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

/**
 * I1-I5: cross-endpoint flows proving register produces data fully
 * compatible with the rest of BACKEND-02 (login, logout, /me,
 * ResolveCurrentCompany) — not a parallel, incompatible path.
 * I6 (register without CSRF -> 419) is exercised by the real HTTP smoke
 * test, not here: PHPUnit bypasses CSRF verification entirely.
 */
class RegisterIntegrationTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function validPayload(): array
    {
        return [
            'company_name' => 'JVW Construções',
            'name' => 'Jefferson Vieira',
            'email' => 'jefferson@example.com',
            'phone' => '+5511999999999',
            'password' => 'correct-password',
            'password_confirmation' => 'correct-password',
        ];
    }

    /** I1: csrf-cookie -> register -> /me. */
    public function test_csrf_cookie_then_register_then_me(): void
    {
        $csrfResponse = $this->withHeaders($this->statefulHeaders())->getJson('/sanctum/csrf-cookie');
        $this->carryCookiesFrom($csrfResponse);

        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $registerResponse->assertCreated();
        $this->carryCookiesFrom($registerResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('user.email', 'jefferson@example.com');
    }

    /** I2: register -> logout -> /me = 401. */
    public function test_register_then_logout_then_me_is_401(): void
    {
        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $registerResponse->assertCreated();
        $this->carryCookiesFrom($registerResponse);

        $logoutResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/logout');
        $logoutResponse->assertNoContent();
        $this->carryCookiesFrom($logoutResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')->assertStatus(401);
    }

    /** I3: register -> logout -> login -> /me shows the same company (register produced BACKEND-02-compatible data). */
    public function test_register_then_logout_then_login_resolves_the_same_company(): void
    {
        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $registerResponse->assertCreated();
        $companyId = $registerResponse->json('active_company.id');
        $this->carryCookiesFrom($registerResponse);

        $logoutResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/logout');
        $this->carryCookiesFrom($logoutResponse);

        $loginResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/login', [
            'email' => 'jefferson@example.com',
            'password' => 'correct-password',
        ]);
        $loginResponse->assertOk()->assertJsonPath('active_company.id', $companyId);
        $this->carryCookiesFrom($loginResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('active_company.id', $companyId);
    }

    /** I4: the active company persists across separate requests in the same session. */
    public function test_active_company_persists_across_requests_after_register(): void
    {
        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $companyId = $registerResponse->json('active_company.id');
        $this->carryCookiesFrom($registerResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')
            ->assertJsonPath('active_company.id', $companyId);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')
            ->assertJsonPath('active_company.id', $companyId);
    }

    /** I5: ResolveCurrentCompany can resolve the active company right after register, on a stand-in business route. */
    public function test_resolve_current_company_works_immediately_after_register(): void
    {
        Route::middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/business-resource', function () {
                return response()->json([
                    'company_id' => app(CurrentCompanyContext::class)->id(),
                ]);
            });

        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $companyId = $registerResponse->json('active_company.id');
        $this->carryCookiesFrom($registerResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/_test/business-resource')
            ->assertOk()
            ->assertJsonPath('company_id', $companyId);
    }
}
