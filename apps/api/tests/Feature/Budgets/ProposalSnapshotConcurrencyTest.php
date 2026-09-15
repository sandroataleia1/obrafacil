<?php

namespace Tests\Feature\Budgets;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Models\Budget;
use App\Models\Company;
use App\Models\Customer;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgetConcurrency;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * PROPOSAL-DOC-01A §7/§58 — real PostgreSQL concurrency: a Company
 * profile PUT racing a Budget submit on the SAME Company row. Uses
 * DatabaseTruncation (never RefreshDatabase) and the REAL local storage
 * disk (never Storage::fake()) — both probes run as genuinely separate OS
 * processes and cannot share this test process's fakes.
 */
class ProposalSnapshotConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithBudgetConcurrency, InteractsWithBudgets;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * @return array{0: Company, 1: Budget}
     */
    private function companyWithDraftBudgetAndLogo(string $initialName): array
    {
        [$company, $user] = $this->makeCompanyWithMember(['name' => $initialName]);
        $customer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());

        $logoPath = "companies/{$company->id}/logos/test-logo.png";
        Storage::disk('public')->put($logoPath, 'fake-png-bytes');
        $company->logo_path = $logoPath;
        $company->save();

        $budget = $this->currentCompanyContext()->run($company, function () use ($customer, $user) {
            $budget = app(BudgetService::class)->create(['customer_id' => $customer->id, 'title' => 'Orçamento'], $user);
            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);

            return $budget;
        });

        return [$company, $budget];
    }

    private function freshBudget(Company $company, string $budgetId): Budget
    {
        return $this->currentCompanyContext()->run($company, fn () => Budget::query()->findOrFail($budgetId));
    }

    /**
     * Ordering A: submit acquires the Company row lock FIRST — the
     * concurrent Company update must block until submit's transaction
     * commits, so the frozen snapshot is exactly the PRE-update Company
     * state, never a mix.
     */
    public function test_submit_locks_company_first_snapshot_is_pre_update_state(): void
    {
        [$company, $budget] = $this->companyWithDraftBudgetAndLogo('Empresa Original');

        $processSubmit = $this->startProposalSnapshotConcurrencyProbe(
            $company, $budget->id, 'submit-with-company-hold', ['hold-ms' => 600]
        );
        usleep(150_000);
        $processUpdate = $this->startProposalSnapshotConcurrencyProbe(
            $company, '-', 'update-company', ['name' => 'Empresa Atualizada']
        );

        [$resultSubmit, $resultUpdate] = $this->waitForBudgetProbes([$processSubmit, $processUpdate]);

        $this->assertSame('ok', $resultSubmit['status'], json_encode($resultSubmit));
        $this->assertSame('ok', $resultUpdate['status'], json_encode($resultUpdate));

        // The snapshot must be the name that existed BEFORE the update —
        // never "Empresa Atualizada" (proves no mixed-state read).
        $this->assertSame('Empresa Original', $resultSubmit['outcome']['snapshot_name']);

        $fresh = $this->freshBudget($company, $budget->id);
        $this->assertSame('pending_approval', $fresh->status->value);
        $this->assertSame('Empresa Original', $fresh->company_snapshot['name']);
        $this->assertNotNull($fresh->proposal_logo_path);
        Storage::disk('public')->assertExists($fresh->proposal_logo_path);

        // The Company row itself DID get the update, applied after submit committed.
        $freshCompany = $this->currentCompanyContext()->run($company, fn () => Company::query()->findOrFail($company->id));
        $this->assertSame('Empresa Atualizada', $freshCompany->name);

        Storage::disk('public')->deleteDirectory("companies/{$company->id}");
    }

    /**
     * Ordering B: the Company update acquires the row lock FIRST — submit
     * must block until the update's transaction commits, so the frozen
     * snapshot is exactly the POST-update Company state.
     */
    public function test_company_update_locks_first_snapshot_is_post_update_state(): void
    {
        [$company, $budget] = $this->companyWithDraftBudgetAndLogo('Empresa Antes');

        $processUpdate = $this->startProposalSnapshotConcurrencyProbe(
            $company, '-', 'update-company', ['name' => 'Empresa Depois', 'hold-ms' => 600]
        );
        usleep(150_000);
        $processSubmit = $this->startProposalSnapshotConcurrencyProbe(
            $company, $budget->id, 'submit-with-company-hold'
        );

        [$resultUpdate, $resultSubmit] = $this->waitForBudgetProbes([$processUpdate, $processSubmit]);

        $this->assertSame('ok', $resultUpdate['status'], json_encode($resultUpdate));
        $this->assertSame('ok', $resultSubmit['status'], json_encode($resultSubmit));

        // The snapshot must be the name AFTER the update — the submit
        // genuinely waited for the update's transaction to commit first.
        $this->assertSame('Empresa Depois', $resultSubmit['outcome']['snapshot_name']);

        $fresh = $this->freshBudget($company, $budget->id);
        $this->assertSame('Empresa Depois', $fresh->company_snapshot['name']);

        Storage::disk('public')->deleteDirectory("companies/{$company->id}");
    }
}
