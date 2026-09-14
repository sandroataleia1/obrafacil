<?php

namespace Tests\Feature\Budgets;

use App\Enums\BudgetStatus;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BL1-BL12. GET /api/v1/budgets and GET /api/v1/budgets/{budget}.
 */
class BudgetListApiTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    /** BL1: unauthenticated list is rejected. */
    public function test_bl1_unauthenticated_list_is_401(): void
    {
        $this->getJson('/api/v1/budgets')->assertStatus(401);
    }

    /** BL2: list defaults to 15 per page. */
    public function test_bl2_default_per_page_is_15(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->currentCompanyContext()->run($company, function () use ($customer) {
            Budget::factory()->count(20)->create(['customer_id' => $customer->id]);
        });

        $response = $this->getJson('/api/v1/budgets');
        $response->assertStatus(200);
        $this->assertCount(15, $response->json('data'));
    }

    /** BL3: per_page is capped at 100. */
    public function test_bl3_per_page_capped_at_100(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->currentCompanyContext()->run($company, function () use ($customer) {
            Budget::factory()->count(5)->create(['customer_id' => $customer->id]);
        });

        $response = $this->getJson('/api/v1/budgets?per_page=500');
        $response->assertStatus(422)->assertJsonValidationErrors(['per_page']);
    }

    /** BL4: list only shows the current tenant's budgets. */
    public function test_bl4_list_is_tenant_scoped(): void
    {
        $otherCustomerBudget = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => Budget::factory()->create());
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $mine = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $response = $this->getJson('/api/v1/budgets');
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($mine));
        $this->assertFalse($ids->contains($otherCustomerBudget->id));
    }

    /** BL5: filter by status. */
    public function test_bl5_filter_by_status(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->currentCompanyContext()->run($company, function () use ($customer) {
            Budget::factory()->create(['customer_id' => $customer->id, 'status' => BudgetStatus::Draft]);
            Budget::factory()->approved()->create(['customer_id' => $customer->id]);
        });

        $response = $this->getJson('/api/v1/budgets?status=approved');
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('approved', $response->json('data.0.status'));
    }

    /** BL6: filter by customer_id. */
    public function test_bl6_filter_by_customer(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customerA = $this->makeCustomer(['name' => 'A']);
        $customerB = $this->makeCustomer(['name' => 'B']);
        $this->currentCompanyContext()->run($company, function () use ($customerA, $customerB) {
            Budget::factory()->create(['customer_id' => $customerA->id]);
            Budget::factory()->create(['customer_id' => $customerB->id]);
        });

        $response = $this->getJson("/api/v1/budgets?customer_id={$customerA->id}");
        $this->assertCount(1, $response->json('data'));
    }

    /** BL7: search matches the formatted number (ORC-000001). */
    public function test_bl7_search_matches_formatted_number(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]));

        $response = $this->getJson('/api/v1/budgets?search=ORC-000001');
        $this->assertCount(1, $response->json('data'));
    }

    /** BL8: search matches title. */
    public function test_bl8_search_matches_title(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id, 'title' => 'Reforma de cozinha']));

        $response = $this->getJson('/api/v1/budgets?search=cozinha');
        $this->assertCount(1, $response->json('data'));
    }

    /** BL9: search matches customer_name snapshot. */
    public function test_bl9_search_matches_customer_name(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer(['name' => 'João da Silva']);
        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]));

        $response = $this->getJson('/api/v1/budgets?search=João');
        $this->assertCount(1, $response->json('data'));
    }

    /** BL10: list ordering is deterministic (newest first, id as tiebreaker). */
    public function test_bl10_list_order_is_deterministic(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $this->currentCompanyContext()->run($company, function () use ($customer) {
            Budget::factory()->count(3)->create(['customer_id' => $customer->id]);
        });

        $first = collect($this->getJson('/api/v1/budgets')->json('data'))->pluck('id');
        $second = collect($this->getJson('/api/v1/budgets')->json('data'))->pluck('id');
        $this->assertSame($first->all(), $second->all());
    }

    /** BL11: the list resource never includes items[] (and therefore never a per-item calculation_snapshot either). */
    public function test_bl11_list_never_includes_items(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->assertStatus(201);

        $this->getJson('/api/v1/budgets')->assertJsonMissingPath('data.0.items');
    }

    /** BL12: show returns items (each item's own calculation_snapshot lives inside items[], never at the Budget root), a cross-tenant id is a 404. */
    public function test_bl12_show_returns_full_detail_and_cross_tenant_is_404(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertStatus(200)->assertJsonCount(1, 'items');

        $otherBudgetId = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => Budget::factory()->create()->id);
        $this->getJson("/api/v1/budgets/{$otherBudgetId}")->assertStatus(404);
    }
}
