<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Customer;
use App\Projects\ProjectLocker;
use App\Projects\ProjectService;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * PROJECT-API-01 §63-64. Test-only harness: launched as a genuinely
 * separate OS process/PostgreSQL connection (via
 * Symfony\Component\Process\Process from the concurrency tests), never
 * called in-process — mirrors App\Console\Commands\BudgetConcurrencyProbe/
 * ServiceOrderConcurrencyProbe exactly.
 *
 * `update`: locks the target Project first (ProjectLocker, same code path
 * as ProjectService::update()), reports the exact moment the lock was
 * acquired, optionally holds it open for `--hold-ms` before performing
 * the update and committing — this is what makes a second concurrent
 * probe's own lock acquisition deterministically wait for the first to
 * commit, so the test can assert exactly one succeeds and the other 409s.
 *
 * `create`: no explicit pre-lock needed — ProjectNumberAllocator's own
 * `SELECT ... FOR UPDATE` on `project_sequences` already serializes
 * concurrent allocations for the same Company.
 */
class ProjectConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:project
        {company : Company UUID}
        {project : Project UUID, or "-" for the create action}
        {action : create|update}
        {--hold-ms=0 : Milliseconds to sleep AFTER acquiring the row lock, BEFORE performing the update}
        {--customer= : Customer UUID (create)}
        {--name=Obra : name (create/update)}
        {--updated-at= : the updated_at precondition to compare (update)}
        {--status= : new status value (update)}
    ';

    protected $description = 'PROJECT-API-01 test harness — locks a Project and performs one action in its own real DB connection/process.';

    public function handle(ProjectLocker $locker, ProjectService $projectService): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('ProjectConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $projectId = (string) $this->argument('project');
        $action = (string) $this->argument('action');
        $holdMs = (int) $this->option('hold-ms');

        $company = Company::query()->findOrFail($companyId);

        $result = [
            'action' => $action,
            'pid' => getmypid(),
        ];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use (
                $locker, $projectService, $projectId, $action, $holdMs, &$result
            ) {
                if ($action === 'create') {
                    $customer = Customer::query()->findOrFail((string) $this->option('customer'));
                    $project = $projectService->create([
                        'name' => (string) $this->option('name'),
                        'customer_id' => $customer->id,
                    ]);
                    $result['outcome'] = ['id' => $project->id, 'number' => $project->number];

                    return;
                }

                DB::transaction(function () use ($locker, $projectService, $projectId, $holdMs, &$result) {
                    $locker->lock($projectId);
                    $result['locked_at'] = microtime(true);

                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $result['outcome'] = $this->dispatchUpdate($projectService, $projectId);
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
    private function dispatchUpdate(ProjectService $projectService, string $projectId): array
    {
        $updatedAt = (string) $this->option('updated-at');
        if ($updatedAt === '') {
            throw new InvalidArgumentException('--updated-at is required for the update action.');
        }

        $validated = ['updated_at' => $updatedAt, 'name' => (string) $this->option('name')];

        $status = $this->option('status');
        if ($status !== null && $status !== '') {
            $validated['status'] = $status;
        }

        $project = $projectService->update($projectId, $validated);

        return ['status' => $project->status->value, 'name' => $project->name, 'updated_at' => $project->updated_at?->toJSON()];
    }
}
