<?php

namespace Tests\Feature\Projects;

use App\Http\Requests\StoreBudgetRequest;
use App\Http\Requests\UpdateBudgetRequest;
use App\Models\Budget;
use App\Models\Project;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §55/§11. Explicit proof this gate did NOT reintroduce a
 * bidirectional Budget<->Project relation. The only link is
 * `Project.source_budget_id` — unilateral, Budget itself stays exactly as
 * BUDGET-API-01 left it.
 */
class ProjectStructuralTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    /** §55: budgets table never gained a project_id column. */
    public function test_budgets_table_has_no_project_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('budgets', 'project_id'));
    }

    /** §55: the Budget model has no project() relation method. */
    public function test_budget_model_has_no_project_relation(): void
    {
        $this->assertFalse(method_exists(Budget::class, 'project'));
    }

    /** §55: the Budget model has no projects() relation method. */
    public function test_budget_model_has_no_projects_relation(): void
    {
        $this->assertFalse(method_exists(Budget::class, 'projects'));
    }

    /** §55: StoreBudgetRequest still prohibits project_id (was already true before this gate; still true after). */
    public function test_store_budget_request_still_prohibits_project_id(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', [
            'customer_id' => $customer->id,
            'title' => 'Orçamento',
            'project_id' => (string) Str::uuid(),
        ])->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** §55: UpdateBudgetRequest still prohibits project_id. */
    public function test_update_budget_request_still_prohibits_project_id(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', [
            'customer_id' => $customer->id, 'title' => 'Orçamento',
        ])->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}", [
            'customer_id' => $customer->id,
            'title' => 'Orçamento',
            'project_id' => (string) Str::uuid(),
        ])->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** §11: the ONLY relation is Project -> source Budget, never the reverse. */
    public function test_project_has_source_budget_relation_budget_has_nothing_back(): void
    {
        $this->assertTrue(method_exists(Project::class, 'sourceBudget'));
        $this->assertTrue(Schema::hasColumn('projects', 'source_budget_id'));
        $this->assertFalse(Schema::hasColumn('budgets', 'id') && Schema::hasColumn('budgets', 'source_budget_id'));
    }

    /** §11: source_budget_id restrictOnDelete — Budget has no DELETE endpoint at all today, but the FK discipline still holds. */
    public function test_source_budget_id_is_restrict_on_delete(): void
    {
        $definitions = collect(DB::select("
            SELECT confdeltype, conname
            FROM pg_constraint
            WHERE conrelid = 'projects'::regclass AND contype = 'f' AND conname LIKE '%source_budget_id%'
        "));

        $this->assertCount(1, $definitions);
        // 'r' = ON DELETE RESTRICT in pg_constraint.confdeltype.
        $this->assertSame('r', $definitions->first()->confdeltype);
    }

    /** customer_address_id is nullOnDelete — 'n' in pg_constraint.confdeltype. */
    public function test_customer_address_id_is_null_on_delete(): void
    {
        $definitions = collect(DB::select("
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'projects'::regclass AND contype = 'f' AND conname LIKE '%customer_address_id%'
        "));

        $this->assertCount(1, $definitions);
        $this->assertSame('n', $definitions->first()->confdeltype);
    }

    /** customer_id is restrictOnDelete — 'r' in pg_constraint.confdeltype. */
    public function test_customer_id_is_restrict_on_delete(): void
    {
        $definitions = collect(DB::select("
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'projects'::regclass AND contype = 'f' AND conname LIKE '%projects_customer_id%'
        "));

        $this->assertCount(1, $definitions);
        $this->assertSame('r', $definitions->first()->confdeltype);
    }

    /** No deleted_at column exists on projects — no delete semantics in v1. */
    public function test_projects_table_has_no_deleted_at_column(): void
    {
        $this->assertFalse(Schema::hasColumn('projects', 'deleted_at'));
    }

    /** The (company_id, number) unique index exists structurally. */
    public function test_number_is_uniquely_indexed_per_company(): void
    {
        $indexes = DB::select("SELECT indexdef FROM pg_indexes WHERE tablename = 'projects'");
        $numberIndex = collect($indexes)->first(fn ($i) => str_contains($i->indexdef, 'number') && str_contains($i->indexdef, 'company_id'));

        $this->assertNotNull($numberIndex);
        $this->assertStringContainsString('UNIQUE', $numberIndex->indexdef);
    }

    /** The status CHECK constraint exists at the database level as a backstop. */
    public function test_status_check_constraint_exists(): void
    {
        $constraints = collect(DB::select("
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'projects'::regclass AND contype = 'c'
        "))->pluck('definition')->implode(' | ');

        $this->assertStringContainsString('planning', $constraints);
        $this->assertStringContainsString('in_progress', $constraints);
        $this->assertStringContainsString('paused', $constraints);
        $this->assertStringContainsString('completed', $constraints);
    }

    /** Ensure the two FormRequest classes still exist unmodified in shape (sanity import check). */
    public function test_budget_requests_are_unchanged_classes(): void
    {
        $this->assertTrue(class_exists(StoreBudgetRequest::class));
        $this->assertTrue(class_exists(UpdateBudgetRequest::class));
    }
}
