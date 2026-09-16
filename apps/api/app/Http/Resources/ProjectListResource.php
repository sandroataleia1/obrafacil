<?php

namespace App\Http\Resources;

use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * PROJECT-API-01 §44. The lean shape for GET /projects — enough for a
 * list UI. `company_id` and the full structured address are never
 * exposed here (§44) — no cost summaries/team/materials/stock/purchases/
 * payables/receivables.
 *
 * @property Project $resource
 */
class ProjectListResource extends JsonResource
{
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
