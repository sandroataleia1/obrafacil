<?php

namespace App\Console\Commands;

use App\MaterialRequirements\MaterialRequirementService;
use App\Models\Company;
use App\Models\Project;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Throwable;

/**
 * SUPPLY-API-01B §42. Test-only harness: launched as a genuinely separate
 * OS process/PostgreSQL connection (via Symfony\Component\Process\Process
 * from MaterialRequirementConcurrencyTest), never called in-process —
 * mirrors App\Console\Commands\ProjectConcurrencyProbe/
 * ServiceOrderConcurrencyProbe exactly. Two concurrent `create` runs for
 * the SAME (project, material) pair prove the real Postgres partial
 * unique index (`material_requirements_project_material_unique`) is the
 * true authority: exactly one succeeds, the other gets the
 * MaterialRequirementService-translated ValidationException, never a raw
 * 500 or two rows.
 */
class MaterialRequirementConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:material-requirement
        {company : Company UUID}
        {project : Project UUID}
        {--material= : Material UUID}
        {--quantity=10.000 : required_quantity}
    ';

    protected $description = 'SUPPLY-API-01B test harness — creates a MaterialRequirement in its own real DB connection/process.';

    public function handle(MaterialRequirementService $service): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('MaterialRequirementConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $projectId = (string) $this->argument('project');

        $company = Company::query()->findOrFail($companyId);

        $result = [
            'pid' => getmypid(),
        ];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use ($service, $projectId, &$result) {
                $project = Project::query()->findOrFail($projectId);

                $requirement = $service->create($project, [
                    'material_id' => (string) $this->option('material'),
                    'required_quantity' => (string) $this->option('quantity'),
                ]);

                $result['outcome'] = ['id' => $requirement->id];
            });

            $result['status'] = 'ok';
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
