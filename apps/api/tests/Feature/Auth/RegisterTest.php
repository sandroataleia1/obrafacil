<?php

namespace Tests\Feature\Auth;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use App\Support\ActiveCompanySession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

class RegisterTest extends TestCase
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

    private function register(array $overrides = [])
    {
        return $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload($overrides));
    }

    /** R1: valid register -> 201. */
    public function test_valid_register_returns_201(): void
    {
        $this->register()->assertCreated();
    }

    /** R2: Company created. */
    public function test_register_creates_company(): void
    {
        $this->register();

        $this->assertDatabaseHas('companies', ['name' => 'JVW Construções']);
    }

    /** R3: User created. */
    public function test_register_creates_user(): void
    {
        $this->register();

        $this->assertDatabaseHas('users', ['email' => 'jefferson@example.com', 'name' => 'Jefferson Vieira']);
    }

    /** R4 + R5: Membership created with role owner. */
    public function test_register_creates_owner_membership(): void
    {
        $this->register();

        $user = User::where('email', 'jefferson@example.com')->firstOrFail();
        $membership = $user->memberships()->firstOrFail();

        $this->assertSame(CompanyRole::Owner, $membership->role);
    }

    /** R6 + R7: response's active_company is the created company; no selection required. */
    public function test_response_has_active_company_and_no_selection_required(): void
    {
        $response = $this->register();

        $company = Company::where('name', 'JVW Construções')->firstOrFail();

        $response->assertJsonPath('active_company.id', $company->id)
            ->assertJsonPath('requires_company_selection', false);
    }

    /** R8: user is already authenticated after register — /me works without a second login. */
    public function test_user_is_authenticated_after_register(): void
    {
        $registerResponse = $this->register();
        $this->carryCookiesFrom($registerResponse);

        $this->withHeaders($this->statefulHeaders())->getJson('/api/v1/me')->assertOk();
    }

    /** R9: password/hash never appear in the response. */
    public function test_response_never_leaks_password(): void
    {
        $response = $this->register();

        $response->assertJsonMissingPath('user.password')
            ->assertJsonMissingPath('user.password_confirmation')
            ->assertJsonMissingPath('user.remember_token');

        $this->assertStringNotContainsString('correct-password', $response->getContent());

        $user = User::where('email', 'jefferson@example.com')->firstOrFail();
        $this->assertStringNotContainsString($user->password, $response->getContent());
    }

    /** R10: valid E.164 phone is persisted as-is. */
    public function test_valid_phone_is_persisted(): void
    {
        $this->register();

        $this->assertDatabaseHas('users', ['email' => 'jefferson@example.com', 'phone' => '+5511999999999']);
    }

    /** R11: invalid phone -> 422. */
    public function test_invalid_phone_returns_422(): void
    {
        $this->register(['phone' => '(11) 99999-9999'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('phone');
    }

    /** R12: password_confirmation mismatch -> 422. */
    public function test_password_confirmation_mismatch_returns_422(): void
    {
        $this->register(['password_confirmation' => 'something-else'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    /** R13: duplicate email -> 422. */
    public function test_duplicate_email_returns_422(): void
    {
        $this->register();

        $this->register(['company_name' => 'Another Co'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    /**
     * R14: rate limit -> 429.
     *
     * Each attempt registers a genuinely new (anonymous) email with no
     * cookies carried forward, simulating separate anonymous clients hitting
     * the same IP. Two resets between attempts are needed only because of
     * PHPUnit-only artifacts (never present across real separate requests):
     * Auth::forgetGuards() clears the 'web' guard's memoized user (it
     * otherwise keeps answering "authenticated" for the rest of the test
     * process once one attempt logs in), and session()->flush() clears the
     * SESSION_DRIVER=array store's in-memory attributes (that store is a
     * singleton for the whole test process; a new session ID alone doesn't
     * erase what a previous "request" wrote into it, since nothing here
     * recreates the Store object the way a fresh process would).
     */
    public function test_register_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            Auth::forgetGuards();
            session()->flush();

            $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload([
                'email' => "user{$i}@example.com",
            ]))->assertCreated();
        }

        Auth::forgetGuards();
        session()->flush();

        $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload([
            'email' => 'oneMore@example.com',
        ]))->assertStatus(429);
    }

    /** R15: hostile payload cannot inject company_id/role/id/active_company_id/created_by. */
    public function test_hostile_payload_cannot_inject_server_controlled_fields(): void
    {
        $foreignCompany = Company::factory()->create();
        $spoofedUuid = '11111111-1111-1111-1111-111111111111';

        $response = $this->register([
            'company_id' => $foreignCompany->id,
            'active_company_id' => $foreignCompany->id,
            'role' => 'admin',
            'created_by' => $spoofedUuid,
            'id' => $spoofedUuid,
        ]);

        $response->assertCreated();

        $user = User::where('email', 'jefferson@example.com')->firstOrFail();
        $this->assertNotSame($spoofedUuid, $user->id);

        $membership = $user->memberships()->firstOrFail();
        $this->assertNotSame($foreignCompany->id, $membership->company_id);
        $this->assertSame(CompanyRole::Owner, $membership->role);

        $response->assertJsonPath('active_company.id', $membership->company_id);
        $this->assertNotSame($foreignCompany->id, $response->json('active_company.id'));
    }

    /** R16: a failure mid-transaction rolls back everything — no orphan Company/User/Membership. */
    public function test_intermediate_failure_rolls_back_everything(): void
    {
        $companiesBefore = DB::table('companies')->count();
        $usersBefore = DB::table('users')->count();
        $membershipsBefore = DB::table('company_user')->count();

        DB::listen(function ($query) {
            if (str_contains($query->sql, 'insert into "company_user"')) {
                throw new \RuntimeException('simulated failure before membership insert');
            }
        });

        try {
            $this->register();
        } catch (\Throwable) {
            // expected: the simulated failure propagates as a 500, which is fine —
            // what matters is that nothing was left half-created.
        }

        $this->assertSame($companiesBefore, DB::table('companies')->count());
        $this->assertSame($usersBefore, DB::table('users')->count());
        $this->assertSame($membershipsBefore, DB::table('company_user')->count());
    }

    /** R17: an already-authenticated user cannot use /register to create a second company. */
    public function test_already_authenticated_user_cannot_register_again(): void
    {
        $existingUser = User::factory()->create(['password' => Hash::make('correct-password')]);
        $existingCompany = Company::factory()->create();
        $existingCompany->memberships()->create(['user_id' => $existingUser->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($existingUser, 'correct-password')->assertOk();

        $this->withHeaders($this->statefulHeaders())
            ->postJson('/api/v1/register', $this->validPayload(['email' => 'second-company@example.com']))
            ->assertStatus(409);

        $this->assertDatabaseMissing('users', ['email' => 'second-company@example.com']);
    }

    /** R18: session ID is regenerated after register. */
    public function test_register_regenerates_the_session_id(): void
    {
        $preRegister = $this->withHeaders($this->statefulHeaders())->getJson('/sanctum/csrf-cookie');
        $idBeforeRegister = $this->decryptCookieValue($preRegister, config('session.cookie'));
        $this->assertNotNull($idBeforeRegister);

        $this->carryCookiesFrom($preRegister);

        $registerResponse = $this->withHeaders($this->statefulHeaders())->postJson('/api/v1/register', $this->validPayload());
        $registerResponse->assertCreated();

        $idAfterRegister = $this->decryptCookieValue($registerResponse, config('session.cookie'));

        $this->assertNotNull($idAfterRegister);
        $this->assertNotSame($idBeforeRegister, $idAfterRegister);
    }

    /** Zero-membership-after-register is impossible: exactly 1 membership, role owner, active company set. */
    public function test_user_has_exactly_one_membership_after_register(): void
    {
        $this->register();

        $user = User::where('email', 'jefferson@example.com')->firstOrFail();

        $this->assertCount(1, $user->memberships);
        $this->assertSame(CompanyRole::Owner, $user->memberships->first()->role);
        $this->assertSame($user->memberships->first()->company_id, ActiveCompanySession::get());
    }

    /** Names are trimmed but not lowercased. */
    public function test_names_are_trimmed_not_lowercased(): void
    {
        $this->register([
            'company_name' => '  JVW Construções  ',
            'name' => '  Jefferson Vieira  ',
        ]);

        $this->assertDatabaseHas('companies', ['name' => 'JVW Construções']);
        $this->assertDatabaseHas('users', ['name' => 'Jefferson Vieira']);
    }

    /** Email is trimmed and lowercased. */
    public function test_email_is_trimmed_and_lowercased(): void
    {
        $this->register(['email' => '  Jefferson@Example.com  ']);

        $this->assertDatabaseHas('users', ['email' => 'jefferson@example.com']);
    }
}
