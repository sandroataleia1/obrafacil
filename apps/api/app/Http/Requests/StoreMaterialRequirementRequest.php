<?php

namespace App\Http\Requests;

use App\Models\MaterialRequirement;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /api/v1/projects/{project}/material-requirements — SUPPLY-API-01B
 * §10/§18. `project_id` always comes from the route, never the payload.
 * `material`/`project`/`unit_code`/`unit_custom_label` are prohibited —
 * this Request only ever accepts the raw planning fields, never any part
 * of the live-relation snapshot the Resource later builds.
 *
 * The `material_id` uniqueness-per-project check here is a friendly
 * pre-check only — the real, race-safe authority is the Postgres partial
 * unique index (`material_requirements_project_material_unique`),
 * translated by MaterialRequirementService (§18/§19).
 */
class StoreMaterialRequirementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'id' => ['prohibited'],
            'company_id' => ['prohibited'],
            'project_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'material' => ['prohibited'],
            'project' => ['prohibited'],
            'unit_code' => ['prohibited'],
            'unit_custom_label' => ['prohibited'],

            'material_id' => ['required', 'string'],
            'required_quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'notes' => ['nullable', 'string'],
        ];
    }

    public function withValidator(ValidatorContract $validator): void
    {
        $validator->after(function (ValidatorContract $validator) {
            $this->validateMaterialIsUnique($validator);
        });
    }

    private function validateMaterialIsUnique(ValidatorContract $validator): void
    {
        $materialId = $this->input('material_id');
        $projectId = $this->route('project');

        if (! is_string($materialId) || $materialId === '' || ! is_string($projectId) || $projectId === '') {
            return;
        }

        $exists = MaterialRequirement::query()
            ->where('project_id', $projectId)
            ->where('material_id', $materialId)
            ->exists();

        if ($exists) {
            $validator->errors()->add('material_id', 'Este material já possui uma necessidade cadastrada nesta obra.');
        }
    }
}
