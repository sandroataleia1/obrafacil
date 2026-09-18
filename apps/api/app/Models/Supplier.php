<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\SupplierFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Company-wide supplier directory, never Obra-scoped (ADR-017 #2). No
 * relation to PurchaseOrder declared here yet — that table doesn't exist
 * until SUPPLY-API-01C.
 */
#[Fillable(['name', 'document', 'contact_name', 'phone', 'email', 'address', 'notes', 'active'])]
class Supplier extends Model
{
    /** @use HasFactory<SupplierFactory> */
    use BelongsToCompany, HasFactory, HasUuids;

    protected $attributes = [
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }
}
