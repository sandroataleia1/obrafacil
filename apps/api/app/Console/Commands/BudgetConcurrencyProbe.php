<?php

namespace App\Console\Commands;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetLocker;
use App\Budgets\BudgetProposalService;
use App\Budgets\BudgetService;
use App\Models\Budget;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * BUDGET-API-01 §66. Test-only harness: launched as a genuinely separate
 * OS process/PostgreSQL connection (via Symfony\Component\Process\Process
 * from BudgetConcurrencyTest), never called in-process — mirrors
 * App\Console\Commands\ServiceOrderConcurrencyProbe exactly.
 *
 * Locks the target Budget first (same code path as every Service method
 * — BudgetLocker), reports the exact moment the lock was acquired,
 * optionally holds it open for `--hold-ms` before performing the
 * requested action and committing.
 */
class BudgetConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:budget
        {company : Company UUID}
        {budget : Budget UUID, or "-" for the create action}
        {action : create|add-item|submit|approve-manually|reject-manually|approve-public|reject-public}
        {--hold-ms=0 : Milliseconds to sleep AFTER acquiring the row lock, BEFORE performing the action}
        {--catalog-item= : CatalogItem UUID (add-item)}
        {--quantity=1.000 : quantity (add-item)}
        {--token= : proposal_token (approve-public/reject-public)}
        {--user= : User UUID (approve-manually/reject-manually/create)}
        {--customer= : Customer UUID (create)}
        {--title=Orçamento : title (create)}
        {--name=Cliente : decision_by_name (approve-public/reject-public)}
    ';

    protected $description = 'BUDGET-API-01 test harness — locks a Budget and performs one action in its own real DB connection/process.';

    public function handle(
        BudgetLocker $locker,
        BudgetService $budgetService,
        BudgetItemService $itemService,
        BudgetProposalService $proposalService,
    ): int {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('BudgetConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $budgetId = (string) $this->argument('budget');
        $action = (string) $this->argument('action');
        $holdMs = (int) $this->option('hold-ms');

        $company = Company::query()->findOrFail($companyId);

        $result = [
            'action' => $action,
            'pid' => getmypid(),
        ];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use (
                $locker, $budgetService, $itemService, $proposalService, $budgetId, $action, $holdMs, &$result
            ) {
                // Public actions lock by token (no CurrentCompanyContext
                // needed for that lock — still executed inside the
                // context run() here purely so the harness's own
                // bookkeeping/company lookup above stays uniform across
                // actions; the public Service methods themselves never
                // depend on it).
                if (in_array($action, ['approve-public', 'reject-public'], true)) {
                    $this->dispatchPublic($proposalService, $action, $result);

                    return;
                }

                if ($action === 'create') {
                    $user = User::query()->findOrFail((string) $this->option('user'));
                    $budget = $budgetService->create([
                        'customer_id' => (string) $this->option('customer'),
                        'title' => (string) $this->option('title'),
                    ], $user);
                    $result['outcome'] = ['id' => $budget->id, 'number' => $budget->number];

                    return;
                }

                DB::transaction(function () use ($locker, $budgetService, $itemService, $budgetId, $action, $holdMs, &$result) {
                    $locker->lock($budgetId);
                    $result['locked_at'] = microtime(true);

                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $result['outcome'] = $this->dispatch($budgetService, $itemService, $budgetId, $action);
                });
            });

            $result['status'] ??= 'ok';
        } catch (Throwable $e) {
            $result['status'] = 'error';
            $result['exception'] = $e::class;
            $result['message'] = $e->getMessage();
        }

        $result['finished_at'] = microtime(true);

        $this->output->writeln(json_encode($result));

        return self::SUCCESS;
    }

    /**
     * @return array<string, mixed>
     */
    private function dispatch(
        BudgetService $budgetService,
        BudgetItemService $itemService,
        string $budgetId,
        string $action,
    ): array {
        switch ($action) {
            case 'add-item':
                $item = $itemService->addItem($budgetId, [
                    'source_type' => 'catalog',
                    'catalog_item_id' => $this->option('catalog-item'),
                    'quantity' => $this->option('quantity'),
                ]);

                return ['item_id' => $item->id, 'sort_order' => $item->sort_order, 'line_total' => (string) $item->line_total];

            case 'submit':
                $budget = $budgetService->submit($budgetId);

                return ['status' => $budget->status->value, 'proposal_token' => $budget->proposal_token];

            case 'approve-manually':
                $user = User::query()->findOrFail((string) $this->option('user'));
                $budget = $budgetService->approveManually($budgetId, $user);

                return ['status' => $budget->status->value];

            case 'reject-manually':
                $user = User::query()->findOrFail((string) $this->option('user'));
                $budget = $budgetService->rejectManually($budgetId, $user);

                return ['status' => $budget->status->value];

            default:
                throw new InvalidArgumentException("Unknown action [{$action}].");
        }
    }

    /**
     * @param  array<string, mixed>  $result
     */
    private function dispatchPublic(BudgetProposalService $proposalService, string $action, array &$result): void
    {
        try {
            $token = (string) $this->option('token');
            $name = (string) $this->option('name');

            if ($action === 'approve-public') {
                $budget = $proposalService->approve($token, $name);
            } else {
                $budget = $proposalService->reject($token, $name);
            }

            $result['outcome'] = ['status' => $budget->status->value];
            $result['status'] = 'ok';
        } catch (Throwable $e) {
            $result['status'] = 'error';
            $result['exception'] = $e::class;
            $result['message'] = $e->getMessage();
        }
    }
}
