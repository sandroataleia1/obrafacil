<?php

namespace App\MaterialRequirements;

use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\Project;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01B §17. Controller stays thin.
 *
 * §7: `material_id` is resolved tenant-scoped here (`Material::query()`
 * already carries CompanyScope) — a cross-tenant or non-existent id is a
 * 422 on `material_id`, never a silent cross-tenant read. The Project
 * itself is resolved tenant-scoped by the controller (`Project::query()
 * ->findOrFail()`) before this service is ever called — a cross-tenant
 * Project route parameter 404s before reaching here.
 *
 * §19/DOMAIN-UNIQUE-SAVEPOINT-01: the INSERT that can trigger
 * `material_requirements_project_material_unique` runs inside
 * `DB::transaction()`, which becomes a real Postgres SAVEPOINT when this
 * method is already called from within an outer transaction (a real
 * request, or RefreshDatabase's wrapping transaction in tests). Without
 * it, catching the 23505 here would leave that outer transaction poisoned
 * for every later query — the exact bug found in SUPPLY-API-01A's S15 and
 * already present (unfixed, out of scope) in
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
        $material = Material::query()->find($attributes['material_id']);

        if ($material === null) {
            throw ValidationException::withMessages(['material_id' => 'Material inválido.']);
        }

        if (! $material->active) {
            throw ValidationException::withMessages(['material_id' => 'Este material está inativo.']);
        }

        try {
            return DB::transaction(fn () => MaterialRequirement::create([
                'project_id' => $project->id,
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
        $requirement->fill([
            'required_quantity' => $attributes['required_quantity'],
            'notes' => $attributes['notes'] ?? null,
        ]);
        $requirement->save();

        return $requirement;
    }

    public function delete(MaterialRequirement $requirement): void
    {
        $requirement->delete();
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
