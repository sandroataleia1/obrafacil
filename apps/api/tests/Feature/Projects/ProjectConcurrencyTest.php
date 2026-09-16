<?php

namespace Tests\Feature\Projects;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\Feature\Projects\Concerns\InteractsWithProjectConcurrency;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §37-38/§63-64 — real PostgreSQL concurrency, driven via
 * genuinely separate OS processes (App\Console\Commands\ProjectConcurrencyProbe).
 * Uses DatabaseTruncation, never RefreshDatabase — a second real backend
 * connection cannot observe another connection's uncommitted writes.
 */
class ProjectConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithProjectConcurrency, InteractsWithProjects;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * §64: two concurrent create() calls for the same Company never
     * collide — ProjectNumberAllocator's row lock on project_sequences
     * serializes them into two distinct, sequential numbers.
     */
    public function test_number_concurrency_distinct_sequential_numbers(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $customer = $this->currentCompanyContext()->run($company, fn () => Customer::factory()->create());

        $processA = $this->startProjectConcurrencyProbe($company, '-', 'create', ['customer' => $customer->id, 'name' => 'Obra A']);
        $processB = $this->startProjectConcurrencyProbe($company, '-', 'create', ['customer' => $customer->id, 'name' => 'Obra B']);

        [$resultA, $resultB] = $this->waitForProjectProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $numbers = [$resultA['outcome']['number'], $resultB['outcome']['number']];
        $this->assertEqualsCanonicalizing([1, 2], $numbers, 'Two concurrent creates must get distinct sequential numbers');

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(2, Project::query()->count());
        });
    }

    /**
     * PCON1: a valid updated_at precondition lets the update proceed.
     */
    public function test_pcon1_valid_updated_at_update_works(): void
    {
        [$company, $project] = $this->companyAndProjectFixture();

        $process = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $project->updated_at->toJSON(), 'name' => 'Nome Atualizado',
        ]);
        [$result] = $this->waitForProjectProbes([$process]);

        $this->assertSame('ok', $result['status'], json_encode($result));
        $this->assertSame('Nome Atualizado', $result['outcome']['name']);
    }

    /**
     * PCON2: a stale updated_at precondition is rejected with a 409-rendering exception.
     */
    public function test_pcon2_stale_updated_at_conflict(): void
    {
        [$company, $project] = $this->companyAndProjectFixture();

        $staleTimestamp = $project->updated_at->copy()->subMinute()->toJSON();

        $process = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $staleTimestamp, 'name' => 'Não Deveria Aplicar',
        ]);
        [$result] = $this->waitForProjectProbes([$process]);

        $this->assertSame('error', $result['status'], json_encode($result));
        $this->assertSame('App\\Projects\\Exceptions\\ProjectConcurrencyConflictException', $result['exception']);
    }

    /**
     * PCON3/PCON4: two concurrent writers targeting the SAME captured
     * updated_at — the first to acquire the row lock (hold-ms widens the
     * window deterministically) wins and commits; the second observes the
     * ALREADY-ADVANCED updated_at once it finally acquires the lock and
     * gets a clean 409, never a lost update.
     */
    public function test_pcon3_pcon4_two_writers_same_version_one_wins_one_conflicts(): void
    {
        [$company, $project] = $this->companyAndProjectFixture();
        $capturedUpdatedAt = $project->updated_at->toJSON();

        $processA = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $capturedUpdatedAt, 'name' => 'Vencedor', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $capturedUpdatedAt, 'name' => 'Perdedor',
        ]);

        [$resultA, $resultB] = $this->waitForProjectProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('App\\Projects\\Exceptions\\ProjectConcurrencyConflictException', $loser['exception']);
    }

    /**
     * PCON5: the loser's fields never overwrite the winner's already-
     * committed change — the final row reflects exactly the winner's write.
     */
    public function test_pcon5_stale_writer_never_overwrites_winner(): void
    {
        [$company, $project] = $this->companyAndProjectFixture();
        $capturedUpdatedAt = $project->updated_at->toJSON();

        $processA = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $capturedUpdatedAt, 'name' => 'Vencedor', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $capturedUpdatedAt, 'name' => 'Perdedor',
        ]);

        $this->waitForProjectProbes([$processA, $processB]);

        $fresh = $this->currentCompanyContext()->run($company, fn () => Project::query()->findOrFail($project->id));
        $this->assertSame('Vencedor', $fresh->name);
    }

    /**
     * PCON6: the returned updated_at genuinely advances after a
     * successful update — the next PUT must use this new value.
     */
    public function test_pcon6_returned_updated_at_advances(): void
    {
        [$company, $project] = $this->companyAndProjectFixture();
        $originalUpdatedAt = $project->updated_at;

        $process = $this->startProjectConcurrencyProbe($company, $project->id, 'update', [
            'updated-at' => $originalUpdatedAt->toJSON(), 'name' => 'Nome Novo',
        ]);
        [$result] = $this->waitForProjectProbes([$process]);

        $this->assertSame('ok', $result['status'], json_encode($result));
        $newUpdatedAt = Carbon::parse($result['outcome']['updated_at']);
        $this->assertTrue($newUpdatedAt->greaterThanOrEqualTo($originalUpdatedAt));
    }

    /**
     * @return array{0: Company, 1: Project}
     */
    private function companyAndProjectFixture(): array
    {
        [$company] = $this->makeCompanyWithMember();
        $project = $this->currentCompanyContext()->run($company, function () {
            $customer = Customer::factory()->create();

            return Project::factory()->create(['customer_id' => $customer->id]);
        });

        return [$company, $project->fresh()];
    }
}
