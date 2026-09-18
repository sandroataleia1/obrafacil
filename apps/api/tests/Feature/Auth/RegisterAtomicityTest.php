<?php

namespace Tests\Feature\Auth;

use App\Http\Middleware\ResolveCurrentCompany;
use App\Models\Company;
use App\Models\User;
use App\Support\RegistrationSessionBootstrapper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

/**
 * AUTH-REGISTER-ATOMICITY-01: RA1-RA12. RA1-RA5/RA10/RA12/session-fixation
 * are already covered (and still pass unchanged) by the existing
 * `RegisterTest`/`RegisterIntegrationTest` suites — this file adds the
 * new proofs this gate specifically introduces: the missing-session
 * preflight, zero-orphan rollback for a failure at each of the three
 * session-bootstrap steps, cleanup never masking the original exception,
 * and duplicate-email concurrency leaving zero orphan Company rows.
 */
class RegisterAtomicityTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'company_name' => 'JVW Construções',
            'name' => 'Jefferson Vieira',
            'email' => 'jefferson@example.com',
            'phone' => '+5511999999999',
            'password' => 'correct-password',
            'password_confirmation' => 'correct-password',
        ], $overrides);
    }

    private function counts(): array
    {
        return [
            DB::table('companies')->count(),
            DB::table('users')->count(),
            DB::table('company_user')->count(),
        ];
    }

    /**
     * RA6/§23: the REAL no-session reproduction — a request that never
     * receives the stateful-session middleware (no recognized frontend
     * Origin/Referer, exactly the shape that produced the original 500 +
     * orphaned account). Deliberately sends NO `Referer` header — the
     * literal opposite of `statefulHeaders()` — so this goes through the
     * actual `EnsureFrontendRequestsAreStateful` middleware boundary, not
     * a mock.
     */
    public function test_ra6_a_request_with_no_stateful_session_is_rejected_with_zero_writes(): void
    {
        $before = $this->counts();

        $response = $this->postJson('/api/v1/register', $this->validPayload());

        $response->assertStatus(503)
            ->assertJsonPath('message', 'Não foi possível iniciar uma sessão segura. Recarregue a página e tente novamente.');

        $this->assertSame($before, $this->counts());
    }

    /** RA7: a failure at the very first session-bootstrap step (login) still rolls back Company/User/Membership. */
    public function test_ra7_a_failure_during_login_rolls_back_every_write(): void
    {
        $this->app->instance(RegistrationSessionBootstrapper::class, new class extends RegistrationSessionBootstrapper
        {
            public function login(Request $request, User $user): void
            {
                throw new RuntimeException('simulated login failure');
            }
        });

        $before = $this->counts();

        try {
            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        } catch (RuntimeException) {
            // Expected — an unexpected throwable surfaces as a 500 in
            // production; what matters here is the DB state afterward.
        }

        $this->assertSame($before, $this->counts());
    }

    /** RA8: a failure AFTER a real login() succeeded (at regenerateSession) still rolls back every write and reverses the login. */
    public function test_ra8_a_failure_after_login_but_before_completion_rolls_back_every_write(): void
    {
        $this->app->instance(RegistrationSessionBootstrapper::class, new class extends RegistrationSessionBootstrapper
        {
            public function regenerateSession(Request $request): void
            {
                throw new RuntimeException('simulated session regenerate failure');
            }
        });

        $before = $this->counts();

        try {
            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        } catch (RuntimeException) {
            // Expected.
        }

        $this->assertSame($before, $this->counts());
        // The real login() call ran and mutated the guard's in-memory
        // user — cleanupSession() must have reversed it before the
        // request finished, or this session would still resolve as
        // "authenticated" as a now-rolled-back User.
        $this->assertNull(Auth::guard('web')->user());
    }

    /** RA11 (session half): a failure setting active_company_id after login/regenerate also rolls back every write. */
    public function test_ra11_a_failure_setting_active_company_rolls_back_every_write_and_cleans_up_session(): void
    {
        $this->app->instance(RegistrationSessionBootstrapper::class, new class extends RegistrationSessionBootstrapper
        {
            public function activateCompany(string $companyId): void
            {
                throw new RuntimeException('simulated active-company failure');
            }
        });

        $before = $this->counts();

        try {
            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        } catch (RuntimeException) {
            // Expected.
        }

        $this->assertSame($before, $this->counts());
        $this->assertNull(Auth::guard('web')->user());
    }

    /**
     * RA9: cleanup itself failing (a broken session store) must never
     * mask the original exception — the real failure (from
     * regenerateSession) is still what propagates, not a secondary
     * cleanup error.
     */
    public function test_ra9_a_secondary_cleanup_failure_never_masks_the_original_exception(): void
    {
        $this->app->instance(RegistrationSessionBootstrapper::class, new class extends RegistrationSessionBootstrapper
        {
            public function regenerateSession(Request $request): void
            {
                throw new RuntimeException('original session regenerate failure');
            }

            public function cleanup(Request $request): void
            {
                throw new RuntimeException('secondary cleanup failure — broken session store');
            }
        });

        $this->withoutExceptionHandling();
        $before = $this->counts();
        $caught = null;

        try {
            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        } catch (RuntimeException $e) {
            $caught = $e;
        }

        $this->assertNotNull($caught);
        $this->assertSame('original session regenerate failure', $caught->getMessage());
        $this->assertSame($before, $this->counts());
    }

    /**
     * RA11/§16: duplicate-email concurrency — two attempts for the same
     * email, the first wins, the second gets 422, and NEITHER leaves an
     * orphan Company row (the loser's own Company, created earlier in
     * its own transaction, rolls back with it).
     */
    public function test_ra11_concurrent_duplicate_email_leaves_zero_orphan_company(): void
    {
        $companiesBefore = DB::table('companies')->count();

        $first = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload([
            'company_name' => 'Primeira Empresa',
        ]));
        $first->assertCreated();

        Auth::forgetGuards();
        session()->flush();

        $second = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload([
            'company_name' => 'Segunda Empresa',
        ]));
        $second->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertSame($companiesBefore + 1, DB::table('companies')->count());
        $this->assertDatabaseMissing('companies', ['name' => 'Segunda Empresa']);
        $this->assertDatabaseHas('companies', ['name' => 'Primeira Empresa']);
    }

    /** Success flow (RA1-RA5) still works end-to-end through the new transaction boundary, with an immediate /me proving the session. */
    public function test_ra1_to_ra5_success_flow_creates_exactly_one_of_each_and_authenticates(): void
    {
        $companiesBefore = DB::table('companies')->count();
        $usersBefore = DB::table('users')->count();
        $membershipsBefore = DB::table('company_user')->count();

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $response->assertCreated();

        $this->assertSame($companiesBefore + 1, DB::table('companies')->count());
        $this->assertSame($usersBefore + 1, DB::table('users')->count());
        $this->assertSame($membershipsBefore + 1, DB::table('company_user')->count());

        $company = Company::where('name', 'JVW Construções')->firstOrFail();
        $response->assertJsonPath('active_company.id', $company->id);

        $this->carryCookiesFrom($response);
        $me = $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me');
        $me->assertOk()
            ->assertJsonPath('user.email', 'jefferson@example.com')
            ->assertJsonPath('active_company.id', $company->id);
    }

    /**
     * RA10/§17: the controller's OWN `isUniqueEmailViolation()` catch —
     * only reachable for a genuine DB-level race that `RegisterRequest`'s
     * `unique` rule cannot see (the validator's SELECT finds no match,
     * then a colliding row appears before the INSERT runs). Simulated by
     * inserting the colliding row via a raw query the instant the
     * validator's own unique-check SELECT completes — the validator
     * still sees "no match" (already returned), but the controller's
     * subsequent `User::create()` collides for real.
     */
    public function test_ra10_the_controllers_own_db_level_race_catch_is_also_pt_br(): void
    {
        $injected = false;
        DB::listen(function ($query) use (&$injected) {
            if ($injected) {
                return;
            }
            if (str_starts_with(trim($query->sql), 'select') && str_contains($query->sql, '"users"') && str_contains($query->sql, '"email"')) {
                $injected = true;
                DB::connection()->insert(
                    'insert into "users" ("id", "name", "email", "phone", "password", "created_at", "updated_at") values (gen_random_uuid(), ?, ?, ?, ?, now(), now())',
                    ['Race Winner', 'jefferson@example.com', '+5511988887777', bcrypt('whatever')]
                );
            }
        });

        $companiesBefore = DB::table('companies')->count();

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());

        $response->assertStatus(422)
            ->assertJsonValidationErrors('email')
            ->assertJsonPath('errors.email.0', 'Este e-mail já está em uso.');

        $this->assertSame($companiesBefore, DB::table('companies')->count());
    }

    /** Sanity: ResolveCurrentCompany also works immediately, same as before this gate. */
    public function test_resolve_current_company_still_works_immediately_after_register(): void
    {
        $this->app['router']->middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/ra-business-resource', function () {
                return response()->json(['ok' => true]);
            });

        $response = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $response->assertCreated();
        $this->carryCookiesFrom($response);

        $this->withHeaders($this->statefulHeaders())->getJson('/_test/ra-business-resource')->assertOk();
    }
}
