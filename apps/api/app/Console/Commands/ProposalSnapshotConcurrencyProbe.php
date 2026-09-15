<?php

namespace App\Console\Commands;

use App\Budgets\BudgetLocker;
use App\Budgets\BudgetProposalLogoService;
use App\Budgets\CompanyProposalSnapshotBuilder;
use App\Budgets\Exceptions\BudgetStatusConflictException;
use App\Enums\BudgetStatus;
use App\Models\Company;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * PROPOSAL-DOC-01A §58. Test-only harness: launched as a genuinely
 * separate OS process/PostgreSQL connection, never called in-process —
 * mirrors `App\Console\Commands\BudgetConcurrencyProbe` exactly. Two
 * actions, run against the same Company row to prove §7's ordering
 * guarantee (a submit's Company snapshot is always fully-pre-update OR
 * fully-post-update, never a mix):
 *
 *  - `update-company`: performs a REAL Company field update (the exact
 *    same write `CompanyProfileService::update()` performs — this harness
 *    never reimplements that logic, it only adds a test-only hold AFTER
 *    the row is written but BEFORE the transaction commits, so a
 *    concurrent submit attempting `lockForUpdate()` on the same row is
 *    forced to genuinely block on Postgres, not just race in-memory).
 *  - `submit-with-company-hold`: performs the exact same steps
 *    `BudgetService::submit()` does (via the SAME collaborators —
 *    `BudgetLocker`, `CompanyProposalSnapshotBuilder`,
 *    `BudgetProposalLogoService`), with a test-only hold inserted right
 *    after the Company row lock is acquired, so the OTHER ordering (submit
 *    locks first, the Company update blocks until submit commits) can
 *    also be exercised.
 */
class ProposalSnapshotConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:proposal-snapshot
        {company : Company UUID}
        {target : Budget UUID (submit-with-company-hold) or ignored (update-company)}
        {action : update-company|submit-with-company-hold}
        {--hold-ms=0 : Milliseconds to sleep AFTER acquiring the row lock, BEFORE committing}
        {--name= : new Company.name (update-company)}
    ';

    protected $description = 'PROPOSAL-DOC-01A test harness — races a Company profile update against a Budget submit on the same Company row.';

    public function handle(
        BudgetLocker $locker,
        CompanyProposalSnapshotBuilder $snapshotBuilder,
        BudgetProposalLogoService $proposalLogoService,
    ): int {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('ProposalSnapshotConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $target = (string) $this->argument('target');
        $action = (string) $this->argument('action');
        $holdMs = (int) $this->option('hold-ms');

        $company = Company::query()->findOrFail($companyId);

        $result = ['action' => $action, 'pid' => getmypid()];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use (
                $locker, $snapshotBuilder, $proposalLogoService, $companyId, $target, $action, $holdMs, &$result
            ) {
                if ($action === 'update-company') {
                    DB::transaction(function () use ($companyId, $holdMs, &$result) {
                        $company = Company::query()->whereKey($companyId)->lockForUpdate()->firstOrFail();
                        $result['locked_at'] = microtime(true);

                        $company->name = (string) $this->option('name');
                        $company->save();

                        if ($holdMs > 0) {
                            usleep($holdMs * 1000);
                        }
                    });
                    $result['outcome'] = ['name' => (string) $this->option('name')];
                    $result['status'] = 'ok';

                    return;
                }

                if ($action === 'submit-with-company-hold') {
                    DB::transaction(function () use ($locker, $snapshotBuilder, $proposalLogoService, $target, $holdMs, &$result) {
                        $lockedBudget = $locker->lock($target);

                        if (! $lockedBudget->status->isMutable()) {
                            throw new BudgetStatusConflictException('already submitted');
                        }

                        $company = Company::query()->whereKey($lockedBudget->company_id)->lockForUpdate()->firstOrFail();
                        $result['company_locked_at'] = microtime(true);

                        if ($holdMs > 0) {
                            usleep($holdMs * 1000);
                        }

                        $snapshot = $snapshotBuilder->build($company);
                        $logoPath = $proposalLogoService->copyFromCompany($lockedBudget, $company);

                        $lockedBudget->status = BudgetStatus::PendingApproval;
                        $lockedBudget->submitted_at = now();
                        $lockedBudget->proposal_token ??= bin2hex(random_bytes(24));
                        $lockedBudget->company_snapshot = $snapshot;
                        $lockedBudget->proposal_logo_path = $logoPath;
                        $lockedBudget->proposal_template_version = 1;
                        $lockedBudget->save();

                        $result['outcome'] = ['snapshot_name' => $snapshot['name']];
                    });
                    $result['status'] = 'ok';

                    return;
                }

                throw new InvalidArgumentException("Unknown action [{$action}].");
            });
        } catch (Throwable $e) {
            $result['status'] = 'error';
            $result['exception'] = $e::class;
            $result['message'] = $e->getMessage();
        }

        $result['finished_at'] = microtime(true);
        $this->output->writeln(json_encode($result));

        return self::SUCCESS;
    }
}
