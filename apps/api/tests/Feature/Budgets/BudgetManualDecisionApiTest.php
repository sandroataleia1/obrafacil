<?php

namespace Tests\Feature\Budgets;

use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 MD1-MD10. POST /api/v1/budgets/{budget}/approve-manually
 * and /reject-manually — authenticated, tenant-scoped.
 */
class BudgetManualDecisionApiTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function createPendingBudgetId(): string
    {
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(201);
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        return $budgetId;
    }

    /** MD1: unauthenticated manual approve is rejected. */
    public function test_md1_unauthenticated_approve_is_401(): void
    {
        $this->postJson('/api/v1/budgets/00000000-0000-0000-0000-000000000000/approve-manually')->assertStatus(401);
    }

    /** MD2: a valid tenant member can approve manually. */
    public function test_md2_tenant_member_can_approve(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")
            ->assertStatus(200)->assertJson(['status' => 'approved']);
    }

    /** MD3: decision_source is manual_internal, server-derived. */
    public function test_md3_decision_source_is_manual_internal(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")
            ->assertJson(['decision_source' => 'manual_internal']);
    }

    /** MD4: decision_by_user_id is the authenticated user, never the payload. */
    public function test_md4_decision_by_is_server_side(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually", [
            'decision_by_user_id' => '00000000-0000-0000-0000-000000000000',
        ]);
        $response->assertStatus(200)->assertJson(['decision_by_user_id' => $user->id]);
    }

    /** MD5: a valid tenant member can reject manually. */
    public function test_md5_tenant_member_can_reject(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/reject-manually", ['note' => 'Fora do orçamento do cliente'])
            ->assertStatus(200)->assertJson(['status' => 'rejected', 'decision_note' => 'Fora do orçamento do cliente']);
    }

    /** MD6: approving a draft (never submitted) Budget is a 409. */
    public function test_md6_approve_draft_is_409(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(409);
    }

    /** MD7: approving an already-approved Budget is a 409 (no silent overwrite). */
    public function test_md7_double_approve_is_409(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(200);

        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(409);
    }

    /** MD8: rejecting an already-approved Budget is a 409. */
    public function test_md8_reject_after_approve_is_409(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(200);

        $this->postJson("/api/v1/budgets/{$budgetId}/reject-manually")->assertStatus(409);
    }

    /** MD9: a cross-tenant budget id on approve-manually is a 404. */
    public function test_md9_cross_tenant_approve_is_404(): void
    {
        $otherBudgetId = $this->currentCompanyContext()->run(
            Company::factory()->create(),
            fn () => Budget::factory()->pendingApproval()->create()->id
        );
        $this->actingAsNewCompanyMember();

        $this->postJson("/api/v1/budgets/{$otherBudgetId}/approve-manually")->assertStatus(404);
    }

    /** MD10: decided_at is set on a manual decision. */
    public function test_md10_decided_at_is_set(): void
    {
        $this->actingAsNewCompanyMember();
        $budgetId = $this->createPendingBudgetId();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually");
        $this->assertNotNull($response->json('decided_at'));
    }
}
