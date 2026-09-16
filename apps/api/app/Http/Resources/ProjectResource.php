<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\BuildsProjectAddress;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * PROJECT-API-01 §19/§45. The full shape for POST/GET/PUT of a single
 * Project. `company_id` is never exposed. `customer` is a LIVE summary
 * (§18) — never a frozen snapshot. `source_budget` never exposes items/
 * cost/margin (§17), only `{id, number, total}`. No costs/team/materials/
 * stock/purchases/payables/receivables arrays — those are separate future
 * APIs (§19/§20).
 *
 * @property Project $resource
 */
class ProjectResource extends JsonResource
{
    use BuildsProjectAddress;

    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->formattedNumber(),
            'name' => $this->name,
            'status' => $this->status->value,
            'reference' => $this->reference,

            'customer' => [
                'id' => $this->customer_id,
                'name' => $this->customer?->name,
            ],

            'customer_address_id' => $this->customer_address_id,
            'address' => $this->buildAddress($this->resource),

            'expected_start_date' => $this->expected_start_date?->format('Y-m-d'),
            'expected_end_date' => $this->expected_end_date?->format('Y-m-d'),

            'source_budget' => $this->sourceBudget !== null ? [
                'id' => $this->sourceBudget->id,
                'number' => $this->sourceBudget->formattedNumber(),
                'total' => (string) $this->sourceBudget->total,
            ] : null,

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
