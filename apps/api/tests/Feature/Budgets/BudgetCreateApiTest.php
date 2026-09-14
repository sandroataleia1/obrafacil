<?php

namespace Tests\Feature\Budgets;

use App\Models\Budget;
use App\Models\Company;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 B13-B28. POST /api/v1/budgets.
 */
class BudgetCreateApiTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    /** B13: unauthenticated create is rejected. */
    public function test_b13_unauthenticated_create_is_rejected(): void
    {
        $this->postJson('/api/v1/budgets', [])->assertStatus(401);
    }

    /** B14: a valid tenant member can create. */
    public function test_b14_valid_tenant_member_can_create(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))
            ->assertStatus(201);
    }

    /** B15: a newly created Budget always starts draft. */
    public function test_b15_status_is_draft(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))
            ->assertJson(['status' => 'draft']);
    }

    /** B16: the first Budget of a company is ORC-000001. */
    public function test_b16_number_is_orc_000001(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))
            ->assertJson(['number' => 'ORC-000001']);
    }

    /** B17: the second Budget of the same company is ORC-000002. */
    public function test_b17_second_budget_is_orc_000002(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $payload = $this->validBudgetPayload(['customer_id' => $customer->id]);

        $this->postJson('/api/v1/budgets', $payload)->assertJson(['number' => 'ORC-000001']);
        $this->postJson('/api/v1/budgets', $payload)->assertJson(['number' => 'ORC-000002']);
    }

    /** B18: Company B starts its own sequence at ORC-000001. */
    public function test_b18_company_b_starts_at_orc_000001(): void
    {
        $this->actingAsNewCompanyMember();
        $customerA = $this->makeCustomer();
        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customerA->id]))
            ->assertJson(['number' => 'ORC-000001']);

        $this->actingAsNewCompanyMember();
        $customerB = $this->makeCustomer();
        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customerB->id]))
            ->assertJson(['number' => 'ORC-000001']);
    }

    /** B19: customer_id is required. */
    public function test_b19_customer_is_required(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload())
            ->assertStatus(422)->assertJsonValidationErrors(['customer_id']);
    }

    /** B20: title is required. */
    public function test_b20_title_is_required(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', ['customer_id' => $customer->id])
            ->assertStatus(422)->assertJsonValidationErrors(['title']);
    }

    /** B21: a cross-tenant customer_id is rejected as a generic 422. */
    public function test_b21_cross_tenant_customer_is_rejected(): void
    {
        $otherCustomer = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => Customer::factory()->create());
        $this->actingAsNewCompanyMember();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $otherCustomer->id]))
            ->assertStatus(422)->assertJsonValidationErrors(['customer_id']);
    }

    /** B22: the customer snapshot is copied correctly. */
    public function test_b22_customer_snapshot_is_correct(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer([
            'name' => 'Fulano de Tal', 'document' => '52998224725', 'phone' => '+5511999999999', 'email' => 'fulano@example.com',
        ]);

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))
            ->assertJson(['customer' => [
                'name' => 'Fulano de Tal', 'document' => '52998224725', 'phone' => '+5511999999999', 'email' => 'fulano@example.com',
            ]]);
    }

    /** B23: created_by is the authenticated user, server-side, never the payload. */
    public function test_b23_created_by_is_server_side(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]));
        $budgetId = $response->json('id');

        $this->currentCompanyContext()->run($company, function () use ($budgetId, $user) {
            $budget = Budget::query()->findOrFail($budgetId);
            $this->assertSame($user->id, $budget->created_by_user_id);
        });
    }

    /** B24: project_id is prohibited. */
    public function test_b24_project_id_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'project_id' => (string) Str::uuid(),
        ]))->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** B25: status/number/company_id/subtotal/total/margin_percentage are hostile fields, rejected as 422. */
    public function test_b25_hostile_fields_are_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'status' => 'approved',
            'number' => 999,
            'margin_percentage' => '50.00',
            'proposal_token' => 'hijacked',
        ]))->assertStatus(422)->assertJsonValidationErrors(['status', 'number', 'margin_percentage', 'proposal_token']);
    }

    /** B26: create with initial items computes totals atomically. */
    public function test_b26_create_with_initial_items_computes_totals(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '100.00', 'cost_price' => '60.00']);

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'items' => [$this->catalogItemPayload($catalogItem, ['quantity' => '3.000'])],
        ]));

        $response->assertStatus(201)->assertJson([
            'subtotal' => '300.00', 'cost_subtotal' => '180.00', 'margin_amount' => '120.00', 'total' => '300.00',
        ]);
    }

    /** B27: a failure while adding an initial item rolls back the whole Budget and its allocated number. */
    public function test_b27_item_failure_rolls_back_budget_and_sequence(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $inactiveCatalogItem = $this->makeCatalogItem(['active' => false]);

        $response = $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'items' => [$this->catalogItemPayload($inactiveCatalogItem)],
        ]));
        $response->assertStatus(422);

        $this->currentCompanyContext()->run($company, function () {
            $this->assertDatabaseCount('budgets', 0);
            $sequenceRow = DB::table('budget_sequences')->first();
            if ($sequenceRow !== null) {
                $this->assertSame(1, (int) $sequenceRow->next_number);
            }
        });

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))
            ->assertJson(['number' => 'ORC-000001']);
    }

    /** B28: discount_amount greater than the (initial) subtotal is rejected. */
    public function test_b28_discount_greater_than_subtotal_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'discount_amount' => '10.00',
        ]))->assertStatus(422)->assertJsonValidationErrors(['discount_amount']);
    }
}
