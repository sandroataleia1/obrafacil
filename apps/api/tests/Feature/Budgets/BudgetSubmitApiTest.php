<?php

namespace Tests\Feature\Budgets;

use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BT1-BT10. POST /api/v1/budgets/{budget}/submit.
 */
class BudgetSubmitApiTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function createDraftBudgetId(): string
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    /** BT1: submitting a draft with items transitions to pending_approval. */
    public function test_bt1_submit_transitions_to_pending_approval(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(201);

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200)->assertJson(['status' => 'pending_approval']);
    }

    /** BT2: submitting a Budget with zero items is allowed (spec explicitly permits an empty Budget, see B21/structural tests). */
    public function test_bt2_submit_without_items_is_allowed(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")
            ->assertStatus(200)->assertJson(['status' => 'pending_approval', 'subtotal' => '0.00', 'total' => '0.00']);
    }

    /** BT3: submit generates a proposal_token. */
    public function test_bt3_submit_generates_proposal_token(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertNotNull($response->json('proposal_token'));
        $this->assertGreaterThan(20, strlen($response->json('proposal_token')));
    }

    /** BT4: the proposal_token is never the Budget's own UUID. */
    public function test_bt4_proposal_token_is_not_the_budget_uuid(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertNotSame($budgetId, $response->json('proposal_token'));
    }

    /** BT5: submitting twice is a 409 (already submitted). */
    public function test_bt5_double_submit_is_409(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(409);
    }

    /** BT6: submit does not alter item values or totals — the same subtotal/total observed while draft is what submit returns. */
    public function test_bt6_submit_preserves_totals_computed_from_items(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']));
        $beforeSubmit = $this->getJson("/api/v1/budgets/{$budgetId}")->json();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $response->assertJson(['subtotal' => $beforeSubmit['subtotal'], 'total' => $beforeSubmit['total']]);
        $this->assertCount(1, $response->json('items'));
    }

    /** BT7: submit sets submitted_at. */
    public function test_bt7_submit_sets_submitted_at(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $this->assertNotNull($response->json('submitted_at'));
    }

    /** BT8: proposal_token is unique in the database (structural CHECK). */
    public function test_bt8_proposal_token_is_unique(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId1 = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId1}/items", $this->manualItemPayload());
        $budgetId2 = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId2}/items", $this->manualItemPayload());

        $token1 = $this->postJson("/api/v1/budgets/{$budgetId1}/submit")->json('proposal_token');
        $token2 = $this->postJson("/api/v1/budgets/{$budgetId2}/submit")->json('proposal_token');

        $this->assertNotSame($token1, $token2);
    }

    /** BT9: unauthenticated submit is rejected. */
    public function test_bt9_unauthenticated_submit_is_401(): void
    {
        $this->postJson('/api/v1/budgets/00000000-0000-0000-0000-000000000000/submit')->assertStatus(401);
    }

    /** BT10: a cross-tenant budget id on submit is a 404. */
    public function test_bt10_cross_tenant_submit_is_404(): void
    {
        $otherBudgetId = $this->currentCompanyContext()->run(
            Company::factory()->create(),
            fn () => Budget::factory()->create()->id
        );
        $this->actingAsNewCompanyMember();

        $this->postJson("/api/v1/budgets/{$otherBudgetId}/submit")->assertStatus(404);
    }
}
