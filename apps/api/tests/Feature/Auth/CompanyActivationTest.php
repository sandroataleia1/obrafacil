<?php

namespace Tests\Feature\Auth;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\Feature\Auth\Concerns\InteractsWithStatefulRequests;
use Tests\TestCase;

class CompanyActivationTest extends TestCase
{
    use InteractsWithStatefulRequests, RefreshDatabase;

    /** A13: Activating a company the user actually belongs to succeeds. */
    public function test_activating_own_company_succeeds(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password')->assertJsonPath('requires_company_selection', true);

        $this->withHeaders($this->statefulHeaders())
            ->postJson("/api/v1/companies/{$companyA->id}/activate")
            ->assertOk()
            ->assertJsonPath('active_company.id', $companyA->id)
            ->assertJsonPath('requires_company_selection', false);
    }

    /** A14: Activating a company the user does NOT belong to returns 404 (no existence leak). */
    public function test_activating_a_third_partys_company_returns_404(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $ownCompany = Company::factory()->create();
        $ownCompany->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $othersCompany = Company::factory()->create();

        $this->loginAs($user, 'correct-password')->assertOk();

        $this->withHeaders($this->statefulHeaders())
            ->postJson("/api/v1/companies/{$othersCompany->id}/activate")
            ->assertNotFound();

        // A random, non-existent UUID must behave identically — no way to
        // distinguish "not yours" from "doesn't exist".
        $this->withHeaders($this->statefulHeaders())
            ->postJson('/api/v1/companies/'.Str::uuid()->toString().'/activate')
            ->assertNotFound();
    }

    /** A15: Switching from company A to company B succeeds without logging out. */
    public function test_switching_active_company_from_a_to_b(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Member]);

        $this->loginAs($user, 'correct-password');

        $this->withHeaders($this->statefulHeaders())
            ->postJson("/api/v1/companies/{$companyA->id}/activate")
            ->assertJsonPath('active_company.id', $companyA->id);

        $this->withHeaders($this->statefulHeaders())
            ->postJson("/api/v1/companies/{$companyB->id}/activate")
            ->assertJsonPath('active_company.id', $companyB->id);

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/api/v1/me')
            ->assertJsonPath('active_company.id', $companyB->id);
    }

    /** A16: The active company persists across separate requests in the same session. */
    public function test_active_company_persists_across_requests(): void
    {
        $user = User::factory()->create(['password' => Hash::make('correct-password')]);
        $company = Company::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $this->loginAs($user, 'correct-password')->assertJsonPath('active_company.id', $company->id);

        // Two independent, later requests in the same session — neither
        // re-sends any company selection, yet both see the same active company.
        $this->withHeaders($this->statefulHeaders())
            ->getJson('/api/v1/me')
            ->assertJsonPath('active_company.id', $company->id);

        $this->withHeaders($this->statefulHeaders())
            ->getJson('/api/v1/me')
            ->assertJsonPath('active_company.id', $company->id);
    }
}
