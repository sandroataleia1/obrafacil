<?php

namespace App\Stock;

use App\Enums\StockAdjustmentType;
use App\Models\Material;
use App\Models\Project;
use App\Models\StockAdjustment;
use App\Purchases\Quantity;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01E §23-26/§67. Controller stays thin. `create()` is the only
 * public write — StockAdjustment is append-only for its entire lifetime
 * (§20), so there is no update()/delete() here.
 *
 * §23: locks the Material row FIRST, builds the current ledger inside that
 * lock, and validates the candidate event before writing — an
 * ADJUSTMENT_OUT that would leave the timeline negative at ANY point is
 * rejected (§8/§23); an ADJUSTMENT_IN can never fail this check (it only
 * ever raises the balance) and may create the very first positive event
 * for this Project + Material (§24, opening balance — no PurchaseOrder/
 * Receipt required).
 */
class StockAdjustmentService
{
    public function __construct(private readonly StockLedgerService $ledger) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(Project|string $project, array $attributes): StockAdjustment
    {
        return DB::transaction(function () use ($project, $attributes) {
            $projectId = $project instanceof Project ? $project->id : $project;
            $resolvedProject = Project::query()->find($projectId);

            if ($resolvedProject === null) {
                throw ValidationException::withMessages(['project_id' => 'Obra inválida.']);
            }

            // §25: Material only needs to EXIST — active=true not required.
            $material = Material::query()->lockForUpdate()->find($attributes['material_id']);

            if ($material === null) {
                throw ValidationException::withMessages(['material_id' => 'Material inválido.']);
            }

            $type = $attributes['type'] instanceof StockAdjustmentType ? $attributes['type'] : StockAdjustmentType::from($attributes['type']);
            $magnitude = Quantity::normalize((string) $attributes['quantity']);
            $signed = $type === StockAdjustmentType::AdjustmentIn ? $magnitude : Quantity::subtract('0.000', $magnitude);

            if (! $this->ledger->isValidWithCandidate($resolvedProject->id, $material->id, $attributes['occurred_at'], $signed)) {
                throw ValidationException::withMessages([
                    'quantity' => 'Esta operação deixaria o saldo negativo em algum momento da linha do tempo. Verifique a data e a quantidade.',
                ]);
            }

            return StockAdjustment::create([
                'project_id' => $resolvedProject->id,
                'material_id' => $material->id,
                'type' => $type,
                'quantity' => $magnitude,
                'occurred_at' => $attributes['occurred_at'],
                'reason' => $attributes['reason'] ?? null,
            ]);
        });
    }
}
