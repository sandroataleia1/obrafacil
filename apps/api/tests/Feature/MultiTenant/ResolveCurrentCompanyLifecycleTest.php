<?php

namespace Tests\Feature\MultiTenant;

use App\Enums\CompanyRole;
use App\Http\Middleware\ResolveCurrentCompany;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * H1-H7: the request-scoped lifecycle of CurrentCompanyContext under
 * ResolveCurrentCompany — since the context is a singleton in a
 * potentially persistent process, it must never leak between requests,
 * regardless of how the previous request ended.
 */
class ResolveCurrentCompanyLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/current-company', function () {
                return response()->json([
                    'company_id' => app(CurrentCompanyContext::class)->id(),
                ]);
            });

        Route::middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/explode', function () {
                throw new RuntimeException('controller exploded');
            });
    }

    /** H1: Request A resolves Company A. */
    public function test_request_resolves_the_authenticated_users_company(): void
    {
        $companyA = Company::factory()->create();
        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($userA);

        $this->getJson('/_test/current-company')
            ->assertOk()
            ->assertJsonPath('company_id', $companyA->id);
    }

    /** H2: After request A finishes, CurrentCompanyContext is empty again. */
    public function test_context_is_cleared_after_request_finishes(): void
    {
        $companyA = Company::factory()->create();
        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($userA);

        $this->getJson('/_test/current-company')->assertOk();

        $this->assertFalse(app(CurrentCompanyContext::class)->has());
    }

    /** H3: A subsequent request for User B resolves Company B, never inheriting A. */
    public function test_subsequent_request_does_not_inherit_previous_companies_context(): void
    {
        $companyA = Company::factory()->create();
        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        $companyB = Company::factory()->create();
        $userB = User::factory()->create();
        $companyB->memberships()->create(['user_id' => $userB->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($userA);
        $this->getJson('/_test/current-company')->assertOk()->assertJsonPath('company_id', $companyA->id);

        Sanctum::actingAs($userB);
        $this->getJson('/_test/current-company')->assertOk()->assertJsonPath('company_id', $companyB->id);
    }

    /** H4: A request whose controller throws still leaves the context empty afterwards. */
    public function test_context_is_cleared_even_when_the_controller_throws(): void
    {
        $companyA = Company::factory()->create();
        $userA = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $userA->id, 'role' => CompanyRole::Owner]);

        Sanctum::actingAs($userA);

        $response = $this->getJson('/_test/explode');

        $response->assertServerError();
        $this->assertFalse(app(CurrentCompanyContext::class)->has());
    }

    /** H5: A user with zero memberships gets a controlled 403, never a 500 from a RuntimeException. */
    public function test_user_without_membership_gets_403_not_500(): void
    {
        $userWithoutCompany = User::factory()->create();

        Sanctum::actingAs($userWithoutCompany);

        $this->getJson('/_test/current-company')
            ->assertStatus(403)
            ->assertJson(['message' => 'No active company is available for this user.']);

        $this->assertFalse(app(CurrentCompanyContext::class)->has());
    }

    /** H6: A user with exactly one membership resolves normally. */
    public function test_user_with_exactly_one_membership_resolves_that_company(): void
    {
        $company = Company::factory()->create();
        $user = User::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        Sanctum::actingAs($user);

        $this->getJson('/_test/current-company')
            ->assertOk()
            ->assertJsonPath('company_id', $company->id);
    }

    /** H7: A user with more than one membership never gets an arbitrarily-chosen company. */
    public function test_user_with_multiple_memberships_does_not_get_an_arbitrary_company(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $user = User::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        Sanctum::actingAs($user);

        $this->getJson('/_test/current-company')
            ->assertStatus(409)
            ->assertJson(['message' => 'An active company must be selected for this user.']);

        $this->assertFalse(app(CurrentCompanyContext::class)->has());
    }
}
