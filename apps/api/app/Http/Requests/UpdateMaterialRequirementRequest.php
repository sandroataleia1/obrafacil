<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /api/v1/projects/{project}/material-requirements/{requirement} —
 * SUPPLY-API-01B §11. Only `required_quantity`/`notes` are editable —
 * `project_id`/`material_id` can never change once created (§11: "Se
 * usuário escolheu Material errado: excluir e recriar").
 */
class UpdateMaterialRequirementRequest extends FormRequest
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
            'material_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],

            'required_quantity' => ['required', 'numeric', 'gt:0', 'regex:/^\d+(\.\d{1,3})?$/'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
