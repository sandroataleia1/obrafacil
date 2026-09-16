<?php

namespace Tests\Feature\Projects;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Enums\CompanyRole;
use App\Models\Budget;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §10-17/§60. PB1-PB12 — `source_budget_id` is a
 * unilateral, immutable-after-create reference. Budget never gains a
 * relation back to Project.
 */
class ProjectSourceBudgetTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    /** PB1: source_budget_id=null (or omitted) is allowed. */
    public function test_pb1_source_null_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('source_budget', null);
    }

    /** PB2: an approved Budget is accepted as source_budget_id. */
    public function test_pb2_approved_budget_accepted(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('approved');

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(201)->assertJsonPath('source_budget.id', $budget->id);
    }

    /** PB3: a draft Budget is rejected. */
    public function test_pb3_draft_budget_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('draft');

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB4: a pending_approval Budget is rejected. */
    public function test_pb4_pending_approval_budget_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('pending_approval');

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB5: a rejected Budget is rejected. */
    public function test_pb5_rejected_budget_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('rejected');

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB6: a cross-tenant Budget is rejected. */
    public function test_pb6_cross_tenant_budget_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget] = $this->budgetFixture('approved');

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['source_budget_id' => $budget->id]))
            ->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB7: a Budget belonging to a different Customer than the Project's is rejected. */
    public function test_pb7_different_customer_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget] = $this->budgetFixture('approved');
        $otherCustomer = $this->makeCustomer();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $otherCustomer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB8: source_budget_id is immutable after creation — prohibited on PUT. */
    public function test_pb8_source_immutable_after_create(): void
    {
        $this->actingAsNewCompanyMember();
        [$budgetA, $customer] = $this->budgetFixture('approved');
        [$budgetB] = $this->budgetFixture('approved', $customer);

        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budgetA->id,
        ]))->json();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'source_budget_id' => $budgetB->id,
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('source_budget_id');
    }

    /** PB9: the Resource returns a source_budget summary. */
    public function test_pb9_resource_returns_source_budget_summary(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('approved');

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(201);

        $this->assertSame($budget->id, $response->json('source_budget.id'));
        $this->assertSame('ORC-000001', $response->json('source_budget.number'));
    }

    /** PB10: total is returned as a decimal string, server-authoritative. */
    public function test_pb10_total_is_decimal_string(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('approved');

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(201);

        $this->assertIsString($response->json('source_budget.total'));
        $this->assertSame('100.00', $response->json('source_budget.total'));
    }

    /** PB11: creating a Project from a Budget never changes the Budget itself. */
    public function test_pb11_budget_itself_never_changes(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture('approved');
        $originalUpdatedAt = $budget->updated_at;

        $this->postJson(self::ENDPOINT, $this->validProjectPayload([
            'customer_id' => $customer->id,
            'source_budget_id' => $budget->id,
        ]))->assertStatus(201);

        $fresh = $this->currentCompanyContext()->run($this->activeTestCompany, fn () => Budget::query()->findOrFail($budget->id));
        $this->assertTrue($originalUpdatedAt->equalTo($fresh->updated_at));
        $this->assertSame('approved', $fresh->status->value);
    }

    /** PB12: Budget has no reverse relation/column pointing to Project. */
    public function test_pb12_no_reverse_project_relation(): void
    {
        $this->assertFalse(Schema::hasColumn('budgets', 'project_id'));
        $this->assertFalse(method_exists(Budget::class, 'project'));
        $this->assertFalse(method_exists(Budget::class, 'projects'));
    }

    /**
     * @return array{0: Budget, 1: Customer}
     */
    private function budgetFixture(string $status, ?Customer $customer = null): array
    {
        $customer ??= $this->makeCustomer();
        $user = User::factory()->create();
        $this->activeTestCompany->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $budget = $this->currentCompanyContext()->run($this->activeTestCompany, function () use ($customer, $user, $status) {
            $budget = app(BudgetService::class)->create(['customer_id' => $customer->id, 'title' => 'Orçamento'], $user);

            if ($status === 'draft') {
                return $budget;
            }

            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);
            $budget = app(BudgetService::class)->submit($budget);

            if ($status === 'pending_approval') {
                return $budget;
            }

            if ($status === 'approved') {
                return app(BudgetService::class)->approveManually($budget, $user);
            }

            return app(BudgetService::class)->rejectManually($budget, $user);
        });

        return [$budget, $customer];
    }
}
