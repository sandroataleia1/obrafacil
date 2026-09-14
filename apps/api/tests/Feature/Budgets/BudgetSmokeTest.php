<?php

namespace Tests\Feature\Budgets;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

class BudgetSmokeTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    public function test_full_lifecycle_via_http(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '200.00', 'cost_price' => '120.00']);

        $create = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
        ]));
        $create->assertStatus(201)->assertJson(['status' => 'draft', 'number' => 'ORC-000001']);
        $budgetId = $create->json('id');

        $addCatalog = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['quantity' => '2.000']));
        $addCatalog->assertStatus(201)->assertJson(['line_total' => '400.00', 'line_cost_total' => '240.00']);

        $addManual = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00', 'unit_cost' => null]));
        $addManual->assertStatus(201)->assertJson(['line_total' => '50.00', 'line_cost_total' => null]);

        $show = $this->getJson("/api/v1/budgets/{$budgetId}");
        $show->assertStatus(200)->assertJson([
            'subtotal' => '450.00',
            'cost_subtotal' => null,
            'margin_amount' => null,
            'margin_percentage' => null,
        ]);

        $update = $this->putJson("/api/v1/budgets/{$budgetId}", [
            'customer_id' => $customer->id,
            'title' => 'Reforma completa',
            'discount_amount' => '50.00',
        ]);
        $update->assertStatus(200)->assertJson(['total' => '400.00']);

        $submit = $this->postJson("/api/v1/budgets/{$budgetId}/submit");
        $submit->assertStatus(200)->assertJson(['status' => 'pending_approval']);
        $token = $submit->json('proposal_token');
        $this->assertNotNull($token);

        // draft-only mutation after submit is rejected
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(409);

        // public proposal view — no auth
        $publicShow = $this->getJson("/api/v1/proposals/{$token}");
        $publicShow->assertStatus(200)->assertJsonMissing(['cost_subtotal' => null])->assertJson(['total' => '400.00']);
        $publicShow->assertJsonMissingPath('customer_id');

        $approve = $this->postJson("/api/v1/proposals/{$token}/approve", ['name' => 'Fulano', 'accepted' => true]);
        $approve->assertStatus(200)->assertJson(['status' => 'approved']);

        // second decision is a conflict
        $this->postJson("/api/v1/proposals/{$token}/reject", ['name' => 'Fulano'])->assertStatus(409);
    }
}
