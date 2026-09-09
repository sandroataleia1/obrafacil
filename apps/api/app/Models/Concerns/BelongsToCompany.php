<?php

namespace App\Models\Concerns;

use App\Models\Scopes\CompanyScope;
use App\Support\CurrentCompanyContext;

/**
 * Marks a model as belonging to a single company (multi-tenant row).
 *
 * - Every query is transparently scoped to the active CurrentCompanyContext
 *   via CompanyScope (fail-closed: no context set means the query throws,
 *   never "return everything").
 * - `company_id` is force-set from the active context on create, every
 *   time — it is never read from mass-assigned/request input, regardless
 *   of what the model's $fillable declares.
 */
trait BelongsToCompany
{
    protected static function bootBelongsToCompany(): void
    {
        static::addGlobalScope(new CompanyScope);

        static::creating(function ($model): void {
            $model->company_id = app(CurrentCompanyContext::class)->id();
        });
    }

    /**
     * Query the model ignoring the company scope. Reserved for explicit,
     * deliberate cross-tenant operations (e.g. platform-admin tooling).
     * Never call this to work around a missing CurrentCompanyContext.
     */
    public static function withoutCompanyScope()
    {
        return static::withoutGlobalScope(CompanyScope::class);
    }
}
