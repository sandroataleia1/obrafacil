<?php

namespace Tests\Feature\Budgets;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BM1-BM14. Header/item mutation — draft-only.
 */
class BudgetMutationTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function createDraftBudgetId(): string
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    private function submit(string $budgetId): void
    {
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(201);
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);
    }

    /** BM1: header update on a draft Budget succeeds. */
    public function test_bm1_header_update_on_draft_succeeds(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $customerId = $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id');

        $this->putJson("/api/v1/budgets/{$budgetId}", ['customer_id' => $customerId, 'title' => 'Novo título'])
            ->assertStatus(200)->assertJson(['title' => 'Novo título']);
    }

    /** BM2: header update on pending_approval is rejected with 409. */
    public function test_bm2_header_update_on_pending_approval_is_409(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->submit($budgetId);
        $customerId = $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id');

        $this->putJson("/api/v1/budgets/{$budgetId}", ['customer_id' => $customerId, 'title' => 'Não deveria salvar'])
            ->assertStatus(409);
    }

    /** BM3: a customer change recopies the snapshot. */
    public function test_bm3_customer_change_recopies_snapshot(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $newCustomer = $this->makeCustomer(['name' => 'Outro Cliente']);

        $this->putJson("/api/v1/budgets/{$budgetId}", ['customer_id' => $newCustomer->id, 'title' => 'X'])
            ->assertJson(['customer' => ['name' => 'Outro Cliente']]);
    }

    /** BM4: add item on draft succeeds. */
    public function test_bm4_add_item_on_draft_succeeds(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(201);
    }

    /** BM5: add item on pending_approval is 409. */
    public function test_bm5_add_item_on_pending_approval_is_409(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->submit($budgetId);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(409);
    }

    /** BM6: update item on draft succeeds and recalculates totals. */
    public function test_bm6_update_item_on_draft_recalculates(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['quantity' => '2.000'])
            ->assertJson(['line_total' => '200.00']);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['sale_subtotal' => '200.00']);
    }

    /** BM7: update item on pending_approval is 409. */
    public function test_bm7_update_item_on_pending_approval_is_409(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['quantity' => '5.000'])->assertStatus(409);
    }

    /** BM8: delete item on draft succeeds and recalculates totals. */
    public function test_bm8_delete_item_on_draft_recalculates(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00']));

        $this->deleteJson("/api/v1/budgets/{$budgetId}/items/{$itemId}")->assertStatus(204);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['sale_subtotal' => '50.00']);
    }

    /** BM9: delete item on pending_approval is 409. */
    public function test_bm9_delete_item_on_pending_approval_is_409(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/submit")->assertStatus(200);

        $this->deleteJson("/api/v1/budgets/{$budgetId}/items/{$itemId}")->assertStatus(409);
    }

    /** BM10: a cross-budget item id on update is a 404. */
    public function test_bm10_cross_budget_item_update_is_404(): void
    {
        $budgetIdA = $this->createDraftBudgetId();
        $itemIdA = $this->postJson("/api/v1/budgets/{$budgetIdA}/items", $this->manualItemPayload())->json('id');
        $budgetIdB = $this->createDraftBudgetId();

        $this->putJson("/api/v1/budgets/{$budgetIdB}/items/{$itemIdA}", ['quantity' => '2.000'])->assertStatus(404);
    }

    /** BM11: a cross-budget item id on delete is a 404. */
    public function test_bm11_cross_budget_item_delete_is_404(): void
    {
        $budgetIdA = $this->createDraftBudgetId();
        $itemIdA = $this->postJson("/api/v1/budgets/{$budgetIdA}/items", $this->manualItemPayload())->json('id');
        $budgetIdB = $this->createDraftBudgetId();

        $this->deleteJson("/api/v1/budgets/{$budgetIdB}/items/{$itemIdA}")->assertStatus(404);
    }

    /** BM12: there is no DELETE /budgets/{id} route. */
    public function test_bm12_no_delete_budget_route(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->deleteJson("/api/v1/budgets/{$budgetId}")->assertStatus(405);
    }

    /** BM13: updating a budget on approved status is 409. */
    public function test_bm13_update_on_approved_is_409(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $budgetId = $this->createDraftBudgetId();
        $this->submit($budgetId);
        $this->postJson("/api/v1/budgets/{$budgetId}/approve-manually")->assertStatus(200);
        $customerId = $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id');

        $this->putJson("/api/v1/budgets/{$budgetId}", ['customer_id' => $customerId, 'title' => 'X'])->assertStatus(409);
    }

    /** BM14: unauthenticated item mutation is rejected (a random uuid is enough — auth is checked first). */
    public function test_bm14_unauthenticated_item_mutation_is_401(): void
    {
        $this->postJson('/api/v1/budgets/00000000-0000-0000-0000-000000000000/items', $this->manualItemPayload())
            ->assertStatus(401);
    }
}
