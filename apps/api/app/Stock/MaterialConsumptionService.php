<?php

namespace App\Stock;

use App\Models\Material;
use App\Models\MaterialConsumption;
use App\Models\Project;
use App\Purchases\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01E §11-14/§67. Controller stays thin.
 *
 * §11: `create()` locks the Material row FIRST (`lockForUpdate()`), then
 * builds the CURRENT ledger inside that same lock and validates the
 * candidate consumption against it BEFORE writing — this is what makes
 * two concurrent consumptions of the same Material serialize (SC1) instead
 * of both reading a stale balance.
 *
 * §13/§29: `delete()` also locks the Material row, purely to serialize its
 * own lifecycle against MaterialService's dependency guard and any
 * concurrent writer of this same Material's ledger — removing a
 * Consumption can only ever RAISE every later date's cumulative balance,
 * so no chronology re-validation is needed here (unlike GoodsReceipt
 * delete).
 *
 * §67: every method re-resolves Project/Material/Consumption by id under
 * the active CompanyScope — never trusts a Model instance the caller
 * already holds.
 */
class MaterialConsumptionService
{
    public function __construct(private readonly StockLedgerService $ledger) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(Project|string $project, array $attributes): MaterialConsumption
    {
        return DB::transaction(function () use ($project, $attributes) {
            $projectId = $project instanceof Project ? $project->id : $project;
            $resolvedProject = Project::query()->find($projectId);

            if ($resolvedProject === null) {
                throw ValidationException::withMessages(['project_id' => 'Obra inválida.']);
            }

            // §10/§29: Material only needs to EXIST — active=true is
            // deliberately not required (an inactivated Material can still
            // have physical stock at this Obra). Locked so a concurrent
            // Consumption/Adjustment/GoodsReceipt-delete for the same
            // Material serializes against this create().
            $material = Material::query()->lockForUpdate()->find($attributes['material_id']);

            if ($material === null) {
                throw ValidationException::withMessages(['material_id' => 'Material inválido.']);
            }

            $quantity = Quantity::normalize((string) $attributes['quantity']);
            $signed = Quantity::subtract('0.000', $quantity);

            if (! $this->ledger->isValidWithCandidate($resolvedProject->id, $material->id, $attributes['consumed_at'], $signed)) {
                throw ValidationException::withMessages([
                    'quantity' => 'Não há quantidade suficiente deste material disponível na data informada.',
                ]);
            }

            return MaterialConsumption::create([
                'project_id' => $resolvedProject->id,
                'material_id' => $material->id,
                'quantity' => $quantity,
                'consumed_at' => $attributes['consumed_at'],
                'notes' => $attributes['notes'] ?? null,
            ]);
        });
    }

    public function delete(Project|string $project, MaterialConsumption|string $consumption): void
    {
        DB::transaction(function () use ($project, $consumption) {
            $projectId = $project instanceof Project ? $project->id : $project;
            $resolvedProject = Project::query()->findOrFail($projectId);

            $consumptionId = $consumption instanceof MaterialConsumption ? $consumption->id : $consumption;
            $scopedConsumption = MaterialConsumption::query()
                ->where('project_id', $resolvedProject->id)
                ->findOrFail($consumptionId);

            Material::query()->lockForUpdate()->findOrFail($scopedConsumption->material_id);

            $scopedConsumption->delete();
        });
    }
}
