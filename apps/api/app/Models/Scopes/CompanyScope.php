<?php

namespace App\Models\Scopes;

use App\Support\CurrentCompanyContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Restricts every query on a tenant-scoped model to the active
 * CurrentCompanyContext. If no company is currently set, resolving the
 * context throws — there is no branch here that falls back to querying
 * every company's data.
 */
class CompanyScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $companyId = app(CurrentCompanyContext::class)->id();

        $builder->where($model->qualifyColumn('company_id'), $companyId);
    }
}
