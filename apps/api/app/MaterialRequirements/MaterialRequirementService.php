<?php

namespace App\MaterialRequirements;

use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\Project;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01B §17/SUPPLY-API-01B1. Controller stays thin.
 *
 * SUPPLY-API-01B1 §1-2/§8-9: every public method here re-resolves its
 * relations under the active CompanyScope/CurrentCompanyContext instead
 * of trusting a Model instance the caller already holds — an in-memory
 * `Project`/`MaterialRequirement` object carries no live guarantee that it
 * still belongs to the currently active Company, since `Model::save()`/
 * `delete()` use `newModelQuery()` internally, which bypasses ALL global
 * scopes (including `CompanyScope`) and matches purely by primary key.
 * The real HTTP flow already re-fetches `{project}`/`{requirement}`
 * scoped on every request (MaterialRequirementController), so this only
 * changes what a direct/internal Service call can do — never the
 * Controller's own 404 contract (§3).
 *
 * §19/DOMAIN-UNIQUE-SAVEPOINT-01: the INSERT that can trigger
 * `material_requirements_project_material_unique` runs inside
 * `DB::transaction()`, which becomes a real Postgres SAVEPOINT when this
 * method is already called from within an outer transaction (a real
 * request, or RefreshDatabase's wrapping transaction in tests). Without
 * it, catching the 23505 here would leave that outer transaction poisoned
 * for every later query — the exact bug found in SUPPLY-API-01A's S15 and
 * already present (unfixed, out of scope — DOMAIN-UNIQUE-SAVEPOINT-01) in
 * CustomerService::create()/CatalogItemService::create(). This class does
 * not repeat it.
 */
class MaterialRequirementService
{
    private const string PROJECT_MATERIAL_UNIQUE_CONSTRAINT = 'material_requirements_project_material_unique';

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(Project $project, array $attributes): MaterialRequirement
    {
        // §2/§5: never trust the Project instance the caller already
        // holds — re-resolve it by id under CompanyScope. A caller that
        // grabbed a Project under a DIFFERENT tenant's context before the
        // active Company changed (or passed one from another Company
        // entirely) fails here, before any INSERT is attempted.
        $resolvedProject = Project::query()->find($project->id);

        if ($resolvedProject === null) {
            throw ValidationException::withMessages(['project_id' => 'Obra inválida.']);
        }

        $material = Material::query()->find($attributes['material_id']);

        if ($material === null) {
            throw ValidationException::withMessages(['material_id' => 'Material inválido.']);
        }

        if (! $material->active) {
            throw ValidationException::withMessages(['material_id' => 'Este material está inativo.']);
        }

        try {
            return DB::transaction(fn () => MaterialRequirement::create([
                'project_id' => $resolvedProject->id,
                'material_id' => $material->id,
                'required_quantity' => $attributes['required_quantity'],
                'notes' => $attributes['notes'] ?? null,
            ]));
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDuplicate($e);

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(MaterialRequirement $requirement, array $attributes): MaterialRequirement
    {
        // §12: re-resolve by id under CompanyScope before mutating — a
        // Requirement instance from another tenant, held in memory by a
        // direct caller, must never be updatable just because the caller
        // already had a loaded Model (save() bypasses CompanyScope).
        $scopedRequirement = MaterialRequirement::query()->findOrFail($requirement->id);

        $scopedRequirement->fill([
            'required_quantity' => $attributes['required_quantity'],
            'notes' => $attributes['notes'] ?? null,
        ]);
        $scopedRequirement->save();

        return $scopedRequirement;
    }

    public function delete(MaterialRequirement $requirement): void
    {
        // §12/§14: same re-resolution as update() — delete() also bypasses
        // CompanyScope internally (newModelQuery()), so the id alone must
        // be re-checked against the active tenant first.
        $scopedRequirement = MaterialRequirement::query()->findOrFail($requirement->id);
        $scopedRequirement->delete();
    }

    private function rethrowAsValidationIfDuplicate(QueryException $e): void
    {
        if ($e->getCode() !== '23505') {
            return;
        }

        if (! str_contains($e->getMessage(), self::PROJECT_MATERIAL_UNIQUE_CONSTRAINT)) {
            return;
        }

        throw ValidationException::withMessages([
            'material_id' => 'Este material já possui uma necessidade cadastrada nesta obra.',
        ]);
    }
}
