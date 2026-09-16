<?php

namespace App\Projects;

use App\Models\Project;

/**
 * PROJECT-API-01 §37-38. The single place a Project row is pessimistically
 * locked for a mutation. `ProjectService::update()` calls this from
 * within its own `DB::transaction()` closure before comparing the
 * client-supplied `updated_at` precondition against the row's real
 * current value — this is what makes the optimistic-concurrency check
 * atomic: a second concurrent PUT's own `lockForUpdate()` blocks until
 * the first transaction commits, then observes the ALREADY-UPDATED
 * `updated_at`, so it correctly detects staleness instead of racing a
 * plain SELECT-then-UPDATE. Mirrors `ServiceOrderLocker`/`BudgetLocker`.
 */
class ProjectLocker
{
    public function lock(Project|string $project): Project
    {
        $id = $project instanceof Project ? $project->id : $project;

        return Project::query()
            ->whereKey($id)
            ->lockForUpdate()
            ->firstOrFail();
    }
}
