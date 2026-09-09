<?php

namespace Tests\Feature\Auth;

use App\Enums\CompanyRole;
use App\Http\Middleware\ResolveCurrentCompany;
use App\Models\Company;
use App\Models\User;
use App\Support\ActiveCompanySession;
use App\Support\CurrentCompanyContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

/**
 * A17, A19, A20: proves ResolveCurrentCompany's new session-backed
 * resolution against a stand-in business route (no real business resource
 * exists yet this round), driven entirely through the real login/activate
 * endpoints rather than Sanctum::actingAs() shortcuts.
 */
class ResolveCurrentCompanyActiveSessionTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware(['auth:sanctum', ResolveCurrentCompany::class])
            ->get('/_test/business-resource', function () {
                return response()->json([
                    'company_id' => app(CurrentCompanyContext::class)->id(),
                ]);
            });
    }

    /** A19: ResolveCurrentCompany uses the valid active_company_id set via activation, not just "the first one". */
    public function test_business_route_uses_the_explicitly_activated_company(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password');
        $this->withHeaders($this->statefulHeaders())->postJson("/api/v1/companies/{$companyB->id}/activate");

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/_test/business-resource')
            ->assertOk()
            ->assertJsonPath('company_id', $companyB->id);
    }

    /** A20: With >1 memberships and none active, the business route never picks one arbitrarily. */
    public function test_business_route_does_not_pick_a_company_arbitrarily(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password')->assertJsonPath('requires_company_selection', true);

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/_test/business-resource')
            ->assertStatus(409)
            ->assertJson(['message' => 'An active company must be selected for this user.']);
    }

    /** A17: A membership removed after activation invalidates the stale active company — it recovers to the remaining one, never keeps using the removed company. */
    public function test_removed_membership_invalidates_the_stale_active_company_and_recovers(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $membershipA = $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password');
        $this->withHeaders($this->statefulHeaders())->postJson("/api/v1/companies/{$companyA->id}/activate");

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/_test/business-resource')
            ->assertOk()
            ->assertJsonPath('company_id', $companyA->id);

        // The user is removed from company A after having activated it.
        $membershipA->delete();

        // Only company B remains — the middleware must never keep serving A.
        $this->withHeaders($this->statefulHeaders())
            ->getJson('/_test/business-resource')
            ->assertOk()
            ->assertJsonPath('company_id', $companyB->id);

        $this->assertSame($companyB->id, ActiveCompanySession::get());
    }

    /** A17 (edge case): if no memberships remain at all, the stale active company fails closed with 403, not a silent success. */
    public function test_removed_only_membership_fails_closed(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $membership = $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($user, 'correct-password')->assertJsonPath('active_company.id', $company->id);

        $membership->delete();

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/_test/business-resource')
            ->assertStatus(403)
            ->assertJson(['message' => 'No active company is available for this user.']);

        $this->assertNull(ActiveCompanySession::get());
    }
}
