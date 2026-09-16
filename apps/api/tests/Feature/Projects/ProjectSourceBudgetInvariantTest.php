<?php

namespace Tests\Feature\Projects;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Enums\CompanyRole;
use App\Models\Budget;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use App\Models\User;
use App\Projects\ProjectService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01A §2-6/§18. SBI1-SBI8 — calls `ProjectService::create()`
 * DIRECTLY (bypassing StoreProjectRequest entirely), proving the
 * source_budget_id invariant is enforced by the domain Service itself,
 * not only by HTTP-layer validation.
 */
class ProjectSourceBudgetInvariantTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    /** SBI1: a direct Service call with an approved, same-Customer source_budget_id works. */
    public function test_sbi1_direct_service_create_with_approved_valid_source_works(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'approved');

        $project = $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
            'name' => 'Obra Direta', 'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]));

        $this->assertSame($budget->id, $project->source_budget_id);
    }

    /** SBI2: a direct Service call with a draft source fails. */
    public function test_sbi2_direct_service_with_draft_source_fails(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'draft');

        $this->expectException(ValidationException::class);
        $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
            'name' => 'Obra', 'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]));
    }

    /** SBI3: a direct Service call with a pending_approval source fails. */
    public function test_sbi3_direct_service_with_pending_source_fails(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'pending_approval');

        $this->expectException(ValidationException::class);
        $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
            'name' => 'Obra', 'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]));
    }

    /** SBI4: a direct Service call with a rejected source fails. */
    public function test_sbi4_direct_service_with_rejected_source_fails(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget, $customer] = $this->budgetFixture($company, 'rejected');

        $this->expectException(ValidationException::class);
        $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
            'name' => 'Obra', 'customer_id' => $customer->id, 'source_budget_id' => $budget->id,
        ]));
    }

    /** SBI5: a direct Service call with a different Customer's approved Budget fails. */
    public function test_sbi5_direct_service_with_different_customer_fails(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$budget] = $this->budgetFixture($company, 'approved');
        $otherCustomer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());

        try {
            $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
                'name' => 'Obra', 'customer_id' => $otherCustomer->id, 'source_budget_id' => $budget->id,
            ]));
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('source_budget_id', $e->errors());
        }
    }

    /** SBI6: a direct Service call with a cross-tenant Budget fails — bypassing the FormRequest entirely. */
    public function test_sbi6_direct_service_with_cross_tenant_source_fails(): void
    {
        [$companyA] = $this->actingAsNewCompanyMember();
        [$budget] = $this->budgetFixture($companyA, 'approved');

        [$companyB] = $this->actingAsNewCompanyMember();
        $customerB = $this->currentCompanyContext()->run($companyB, fn () => Customer::factory()->create());

        try {
            // §3: the exact scenario — Company A's Budget id passed while
            // CurrentCompanyContext is Company B. Must fail BEFORE any INSERT.
            $this->currentCompanyContext()->run($companyB, fn () => app(ProjectService::class)->create([
                'name' => 'Obra', 'customer_id' => $customerB->id, 'source_budget_id' => $budget->id,
            ]));
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('source_budget_id', $e->errors());
        }

        $this->currentCompanyContext()->run($companyB, function () {
            $this->assertSame(0, Project::query()->count());
        });
    }

    /** SBI7: every failure mode above inserts ZERO Project rows. */
    public function test_sbi7_failures_insert_zero_project(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$draftBudget, $customer] = $this->budgetFixture($company, 'draft');

        try {
            $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
                'name' => 'Obra', 'customer_id' => $customer->id, 'source_budget_id' => $draftBudget->id,
            ]));
        } catch (ValidationException) {
            // expected
        }

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(0, Project::query()->count());
        });
    }

    /** SBI8: a rejected source_budget_id never burns a sequence number — the NEXT successful create still gets OBR-000001. */
    public function test_sbi8_failed_source_validation_does_not_burn_project_number(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        [$draftBudget, $customer] = $this->budgetFixture($company, 'draft');

        try {
            $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
                'name' => 'Obra Rejeitada', 'customer_id' => $customer->id, 'source_budget_id' => $draftBudget->id,
            ]));
        } catch (ValidationException) {
            // expected
        }

        $project = $this->currentCompanyContext()->run($company, fn () => app(ProjectService::class)->create([
            'name' => 'Obra Válida', 'customer_id' => $customer->id,
        ]));

        $this->assertSame(1, $project->number, 'The failed attempt must not have consumed a sequence number.');
    }

    /**
     * @return array{0: Budget, 1: Customer}
     */
    private function budgetFixture(Company $company, string $status): array
    {
        $customer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());
        $user = User::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $budget = $this->currentCompanyContext()->run($company, function () use ($customer, $user, $status) {
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
