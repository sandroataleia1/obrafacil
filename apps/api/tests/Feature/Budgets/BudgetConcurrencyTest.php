<?php

namespace Tests\Feature\Budgets;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Models\Budget;
use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgetConcurrency;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 §66 — real PostgreSQL concurrency, driven via genuinely
 * separate OS processes (App\Console\Commands\BudgetConcurrencyProbe).
 * Uses DatabaseTruncation, never RefreshDatabase — a second real backend
 * connection cannot observe another connection's uncommitted writes.
 */
class BudgetConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithBudgetConcurrency, InteractsWithBudgets;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * @return array{0: Company, 1: User, 2: Customer}
     */
    private function companyFixture(): array
    {
        [$company, $user] = $this->makeCompanyWithMember();
        $customer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());

        return [$company, $user, $customer];
    }

    private function freshBudget(Company $company, string $budgetId): Budget
    {
        return $this->currentCompanyContext()->run($company, fn () => Budget::query()->with('items')->findOrFail($budgetId));
    }

    /**
     * Race 1 (number sequence): two concurrent create() calls for the
     * same Company never collide — BudgetNumberAllocator's row lock on
     * budget_sequences serializes them into two distinct, sequential
     * numbers, never a duplicate and never a skipped one.
     */
    public function test_race_1_concurrent_creates_get_distinct_sequential_numbers(): void
    {
        [$company, $user, $customer] = $this->companyFixture();

        $processA = $this->startBudgetConcurrencyProbe($company, '-', 'create', [
            'customer' => $customer->id, 'user' => $user->id, 'title' => 'Orçamento A', 'hold-ms' => 0,
        ]);
        $processB = $this->startBudgetConcurrencyProbe($company, '-', 'create', [
            'customer' => $customer->id, 'user' => $user->id, 'title' => 'Orçamento B',
        ]);

        [$resultA, $resultB] = $this->waitForBudgetProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $numbers = [$resultA['outcome']['number'], $resultB['outcome']['number']];
        $this->assertEqualsCanonicalizing([1, 2], $numbers, 'Two concurrent creates must get distinct sequential numbers');

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(2, Budget::query()->count());
        });
    }

    /**
     * Race 2 (item mutation vs submit): addItem racing submit() on the
     * same draft Budget — BudgetLocker's FOR UPDATE on the parent row
     * serializes them. Whichever wins the lock first: if addItem wins,
     * submit() sees the item already included in its frozen snapshot; if
     * submit() wins first, the concurrent addItem observes the
     * now-pending_approval status and is rejected with a 409 — the
     * proposal a customer receives can never silently change after being
     * frozen.
     */
    public function test_race_2_add_item_vs_submit_never_corrupts_the_frozen_proposal(): void
    {
        [$company, $user, $customer] = $this->companyFixture();
        [$budget, $catalogItem] = $this->currentCompanyContext()->run($company, function () use ($customer, $user) {
            $budget = app(BudgetService::class)->create(['customer_id' => $customer->id, 'title' => 'Orçamento'], $user);
            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item base', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);
            $catalogItem = CatalogItem::factory()->create(['sale_price' => '50.00']);

            return [$budget, $catalogItem];
        });

        $processA = $this->startBudgetConcurrencyProbe($company, $budget, 'submit', ['hold-ms' => 600]);
        usleep(100_000);
        $processB = $this->startBudgetConcurrencyProbe($company, $budget, 'add-item', [
            'catalog-item' => $catalogItem->id, 'quantity' => '1.000',
        ]);

        [$resultA, $resultB] = $this->waitForBudgetProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('error', $resultB['status'], json_encode($resultB));
        $this->assertSame('App\\Budgets\\Exceptions\\BudgetStatusConflictException', $resultB['exception']);

        $fresh = $this->freshBudget($company, $budget->id);
        $this->assertSame('pending_approval', $fresh->status->value);
        // Only the original item made it in — the racing add-item never
        // landed (rejected by the status check once submit() won the lock).
        $this->assertSame('100.00', (string) $fresh->sale_subtotal);
        $this->assertCount(1, $fresh->items);
        $this->assertBudgetInvariants($company, $budget->id);
    }

    /**
     * Race 3 (public approve vs manual reject): the exact scenario §34/
     * §66-67 calls out — a customer approving via the public link at the
     * same moment an internal user rejects manually. Exactly one
     * decision wins; the loser observes the post-lock terminal status
     * and gets a clean 409, the Budget's status is never silently
     * overwritten by the second decision.
     */
    public function test_race_3_public_approve_vs_manual_reject_exactly_one_wins(): void
    {
        [$company, $user, $customer] = $this->companyFixture();
        $budget = $this->currentCompanyContext()->run($company, function () use ($customer, $user) {
            $budget = app(BudgetService::class)->create(['customer_id' => $customer->id, 'title' => 'Orçamento'], $user);
            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);

            return app(BudgetService::class)->submit($budget);
        });

        $processA = $this->startBudgetConcurrencyProbe($company, $budget, 'approve-public', [
            'token' => $budget->proposal_token, 'name' => 'Cliente Final', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startBudgetConcurrencyProbe($company, $budget, 'reject-manually', [
            'user' => $user->id,
        ]);

        [$resultA, $resultB] = $this->waitForBudgetProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('App\\Budgets\\Exceptions\\BudgetStatusConflictException', $loser['exception']);

        $fresh = $this->freshBudget($company, $budget->id);
        $this->assertContains($fresh->status->value, ['approved', 'rejected']);

        $winnerIsPublic = $resultA['status'] === 'ok';
        $this->assertSame($winnerIsPublic ? 'approved' : 'rejected', $fresh->status->value);
        $this->assertSame($winnerIsPublic ? 'public_link' : 'manual_internal', $fresh->decision_source->value);
    }
}
