<?php

namespace Tests\Feature\Projects;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Enums\CompanyRole;
use App\Models\Budget;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01A §8-9/§11-14. SBU1-SBU8 — customer-change rules once a
 * Project has a source_budget_id, both via HTTP (fast feedback) and
 * proving the Service-level defense holds regardless.
 */
class ProjectSourceBudgetUpdateTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    /** SBU1: a Project WITHOUT a source_budget_id can still change Customer freely. */
    public function test_sbu1_project_without_source_can_change_customer(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();
        $newCustomer = $this->makeCustomer();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $newCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertOk()->assertJsonPath('customer.id', $newCustomer->id);
    }

    /** SBU2: a Project WITH a source_budget_id cannot change to a different Customer. */
    public function test_sbu2_project_with_source_cannot_change_to_different_customer(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $otherCustomer = $this->makeCustomer();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $otherCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('customer_id');
    }

    /** SBU3: the 422 error is scoped to the customer_id field. */
    public function test_sbu3_422_field_is_customer_id(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $otherCustomer = $this->makeCustomer();
        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $otherCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422);

        $this->assertArrayHasKey('customer_id', $response->json('errors'));
        $this->assertStringContainsString('orçamento de outro cliente', $response->json('errors.customer_id.0'));
    }

    /** SBU4: a failed change preserves the original customer_id. */
    public function test_sbu4_failed_change_preserves_original_customer_id(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $otherCustomer = $this->makeCustomer();
        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $otherCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422);

        $this->getJson(self::ENDPOINT."/{$created['id']}")->assertJsonPath('customer.id', $customer->id);
    }

    /** SBU5: a failed change preserves source_budget_id. */
    public function test_sbu5_failed_change_preserves_source_budget_id(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $otherCustomer = $this->makeCustomer();
        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $otherCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422);

        $this->getJson(self::ENDPOINT."/{$created['id']}")->assertJsonPath('source_budget.id', $budget->id);
    }

    /** SBU6: a failed change never advances updated_at — the row is genuinely untouched. */
    public function test_sbu6_failed_change_preserves_updated_at(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $otherCustomer = $this->makeCustomer();
        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $otherCustomer->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422);

        $this->getJson(self::ENDPOINT."/{$created['id']}")->assertJsonPath('updated_at', $created['updated_at']);
    }

    /** SBU7: a Project with a source_budget_id can still update name/status/address/dates. */
    public function test_sbu7_project_with_source_can_update_other_fields(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'name' => 'Nome Atualizado',
            'status' => 'in_progress',
            'address' => ['street' => 'Rua Nova', 'city' => 'Curitiba', 'state' => 'PR'],
            'expected_start_date' => '2026-11-01',
            'expected_end_date' => '2026-12-01',
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame('Nome Atualizado', $response->json('name'));
        $this->assertSame('in_progress', $response->json('status'));
        $this->assertSame('Rua Nova', $response->json('address.street'));
        $this->assertSame('2026-11-01', $response->json('expected_start_date'));
        $this->assertSame($budget->id, $response->json('source_budget.id'));
    }

    /** SBU8: same-Customer update (customer_id resent unchanged) continues working normally. */
    public function test_sbu8_same_customer_update_continues_working(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]))->json();

        $response = $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'customer_id' => $customer->id,
            'name' => 'Nome Resent',
            'updated_at' => $created['updated_at'],
        ])->assertOk();

        $this->assertSame('Nome Resent', $response->json('name'));
        $this->assertSame($customer->id, $response->json('customer.id'));
    }

    /**
     * @return array{0: Budget, 1: Customer}
     */
    private function budgetFixture(Company $company, string $status): array
    {
        $customer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());
        $user = User::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $budget = $this->currentCompanyContext()->run($company, function () use ($customer, $user) {
            $budget = app(BudgetService::class)->create(['customer_id' => $customer->id, 'title' => 'Orçamento'], $user);
            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);
            $budget = app(BudgetService::class)->submit($budget);

            return app(BudgetService::class)->approveManually($budget, $user);
        });

        return [$budget, $customer];
    }
}
