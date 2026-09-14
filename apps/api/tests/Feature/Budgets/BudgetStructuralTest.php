<?php

namespace Tests\Feature\Budgets;

use App\Models\Budget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 B1-B12. Schema/numbering structural guarantees: Budget is
 * independent of Project, money columns are decimal (never float),
 * margin_amount has no not-negative CHECK, proposal_token is unique, and
 * there is no hard delete of a Budget.
 */
class BudgetStructuralTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    /** B1: the migration never created a project_id column on budgets. */
    public function test_b1_budgets_table_has_no_project_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('budgets', 'project_id'));
    }

    /** B2: the migration never created a project_id column on budget_items. */
    public function test_b2_budget_items_table_has_no_project_id_column(): void
    {
        $this->assertFalse(Schema::hasColumn('budget_items', 'project_id'));
    }

    /** B3: the Budget model has no Project relation method. */
    public function test_b3_budget_model_has_no_project_relation(): void
    {
        $this->assertFalse(method_exists(Budget::class, 'project'));
    }

    /** B4: a create request carrying project_id is a 422 prohibited. */
    public function test_b4_create_with_project_id_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id,
            'project_id' => (string) Str::uuid(),
        ]))->assertStatus(422)->assertJsonValidationErrors(['project_id']);
    }

    /** B5: money columns are decimal, never double/float, at the Postgres level. */
    public function test_b5_money_columns_are_decimal_not_float(): void
    {
        $columns = DB::select("
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name = 'budgets' AND column_name IN
            ('sale_subtotal', 'cost_subtotal', 'margin_amount', 'discount_amount', 'total')
        ");

        $this->assertCount(5, $columns);
        foreach ($columns as $column) {
            $this->assertSame('numeric', $column->data_type, "{$column->column_name} must be numeric (decimal), never float/double");
        }
    }

    /** B6: margin_amount has NO "not negative" CHECK constraint — selling below cost is valid. */
    public function test_b6_margin_amount_has_no_not_negative_check(): void
    {
        $constraints = DB::select("
            SELECT conname, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'budgets'::regclass AND contype = 'c'
        ");

        foreach ($constraints as $constraint) {
            $this->assertStringNotContainsStringIgnoringCase('margin_amount', $constraint->definition);
        }
    }

    /** B7: sale_subtotal/discount_amount/total DO have a "not negative" CHECK constraint. */
    public function test_b7_sale_subtotal_discount_total_have_not_negative_checks(): void
    {
        $definitions = collect(DB::select("
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'budgets'::regclass AND contype = 'c'
        "))->pluck('definition')->implode(' | ');

        $this->assertStringContainsString('sale_subtotal', $definitions);
        $this->assertStringContainsString('discount_amount', $definitions);
        $this->assertStringContainsString('total', $definitions);
    }

    /** SS1/SS2: the migration created sale_subtotal, and never the ambiguous old "subtotal" name. */
    public function test_ss1_ss2_migration_has_sale_subtotal_not_subtotal(): void
    {
        $this->assertTrue(Schema::hasColumn('budgets', 'sale_subtotal'));
        $this->assertFalse(Schema::hasColumn('budgets', 'subtotal'));
    }

    /** NU6: budget_items.unit is nullable at the Postgres level. */
    public function test_nu6_budget_items_unit_column_is_nullable(): void
    {
        $columns = DB::select("
            SELECT is_nullable FROM information_schema.columns
            WHERE table_name = 'budget_items' AND column_name = 'unit'
        ");

        $this->assertCount(1, $columns);
        $this->assertSame('YES', $columns[0]->is_nullable);
    }

    /** B8: proposal_token has a unique index at the database level. */
    public function test_b8_proposal_token_is_uniquely_indexed(): void
    {
        $indexes = DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'budgets'");
        $tokenIndex = collect($indexes)->first(fn ($i) => str_contains($i->indexdef, 'proposal_token'));

        $this->assertNotNull($tokenIndex);
        $this->assertStringContainsString('UNIQUE', $tokenIndex->indexdef);
    }

    /** B9: budgets.number is uniquely indexed per company. */
    public function test_b9_number_is_uniquely_indexed_per_company(): void
    {
        $indexes = DB::select("SELECT indexdef FROM pg_indexes WHERE tablename = 'budgets'");
        $numberIndex = collect($indexes)->first(fn ($i) => str_contains($i->indexdef, 'number') && str_contains($i->indexdef, 'company_id'));

        $this->assertNotNull($numberIndex);
        $this->assertStringContainsString('UNIQUE', $numberIndex->indexdef);
    }

    /** B10: there is no DELETE /budgets/{id} route (405, row always remains). */
    public function test_b10_no_delete_budget_route_and_row_always_remains(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $response = $this->deleteJson("/api/v1/budgets/{$budgetId}");

        $this->assertContains($response->getStatusCode(), [404, 405]);
        $this->assertDatabaseHas('budgets', ['id' => $budgetId]);
    }

    /** B11: budget_items.budget_id cascades on delete — a deleted Budget takes its items with it (even though Budgets are never deleted through the app). */
    public function test_b11_items_cascade_on_budget_delete(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->json('id');

        $this->currentCompanyContext()->run($company, function () use ($budgetId, $itemId) {
            DB::table('budgets')->where('id', $budgetId)->delete();
            $this->assertDatabaseMissing('budget_items', ['id' => $itemId]);
        });
    }

    /** B12: quantity/unit_price CHECK constraints are structurally enforced on budget_items. */
    public function test_b12_budget_items_quantity_and_price_checks_exist(): void
    {
        $definitions = collect(DB::select("
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'budget_items'::regclass AND contype = 'c'
        "))->pluck('definition')->implode(' | ');

        $this->assertStringContainsString('quantity', $definitions);
        $this->assertStringContainsString('unit_price', $definitions);
    }
}
