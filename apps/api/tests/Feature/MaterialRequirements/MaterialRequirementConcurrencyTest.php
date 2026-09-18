<?php

namespace Tests\Feature\MaterialRequirements;

use App\Models\Customer;
use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirementConcurrency;
use Tests\Feature\MaterialRequirements\Concerns\InteractsWithMaterialRequirements;
use Tests\TestCase;

/**
 * SUPPLY-API-01B §42/§19 — real PostgreSQL concurrency, driven via
 * genuinely separate OS processes (App\Console\Commands\
 * MaterialRequirementConcurrencyProbe). Uses DatabaseTruncation, never
 * RefreshDatabase — a second real backend connection cannot observe
 * another connection's uncommitted writes.
 */
class MaterialRequirementConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithMaterialRequirementConcurrency, InteractsWithMaterialRequirements;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * Two concurrent create() calls for the SAME (project, material) pair:
     * exactly one succeeds, the other gets a clean validation conflict —
     * never two rows, never a raw 500/poisoned-transaction failure.
     */
    public function test_two_concurrent_creates_same_project_material_one_wins_one_conflicts(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $project = $this->currentCompanyContext()->run($company, function () {
            return Project::factory()->create(['customer_id' => Customer::factory()]);
        });
        $material = $this->currentCompanyContext()->run($company, fn () => Material::factory()->create());

        $processA = $this->startMaterialRequirementConcurrencyProbe($company, $project->id, ['material' => $material->id]);
        $processB = $this->startMaterialRequirementConcurrencyProbe($company, $project->id, ['material' => $material->id]);

        [$resultA, $resultB] = $this->waitForMaterialRequirementProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('Illuminate\\Validation\\ValidationException', $loser['exception']);

        $this->currentCompanyContext()->run($company, function () use ($project, $material) {
            $this->assertSame(
                1,
                MaterialRequirement::query()->where('project_id', $project->id)->where('material_id', $material->id)->count()
            );
        });
    }
}
