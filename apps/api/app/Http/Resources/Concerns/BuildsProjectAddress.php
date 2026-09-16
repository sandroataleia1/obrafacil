<?php

namespace App\Http\Resources\Concerns;

use App\Models\Project;

/**
 * PROJECT-API-01 §46. If every address_* column is null, the Resource
 * returns `address: null` — never an object with eight null properties.
 */
trait BuildsProjectAddress
{
    /**
     * @return array<string, mixed>|null
     */
    private function buildAddress(Project $project): ?array
    {
        $fields = [
            'postal_code' => $project->address_postal_code,
            'street' => $project->address_street,
            'number' => $project->address_number,
            'complement' => $project->address_complement,
            'neighborhood' => $project->address_neighborhood,
            'city' => $project->address_city,
            'state' => $project->address_state,
            'reference_point' => $project->address_reference_point,
        ];

        if (count(array_filter($fields, fn ($value) => $value !== null)) === 0) {
            return null;
        }

        return $fields;
    }
}
