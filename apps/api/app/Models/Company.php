<?php

namespace App\Models;

use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'document', 'timezone'])]
class Company extends Model
{
    /** @use HasFactory<CompanyFactory> */
    use HasFactory, HasUuids;

    /**
     * Mirrors the migration's DB-level default so a freshly-instantiated
     * (not yet saved/refreshed) Company already has a usable timezone in
     * memory — Eloquent doesn't otherwise reflect a DB column default back
     * onto the model instance that triggered the insert.
     */
    protected $attributes = [
        'timezone' => 'America/Sao_Paulo',
    ];

    public function memberships(): HasMany
    {
        return $this->hasMany(CompanyMembership::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_user')
            ->withPivot('role')
            ->withTimestamps();
    }
}
