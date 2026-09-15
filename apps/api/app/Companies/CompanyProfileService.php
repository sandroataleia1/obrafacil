<?php

namespace App\Companies;

use App\Models\Company;
use Illuminate\Support\Facades\DB;

/**
 * The only place that writes Company profile fields (§7 "update
 * transacional simples") — a single-row update, wrapped in a transaction
 * for consistency with the rest of the codebase's write services even
 * though there is nothing else to coordinate here yet (no related tables
 * touched by this gate — §15/§16).
 */
class CompanyProfileService
{
    /**
     * @param  array<string, mixed>  $validated  UpdateCompanyProfileRequest::validated() shape.
     */
    public function update(Company $company, array $validated): Company
    {
        return DB::transaction(function () use ($company, $validated) {
            $company->fill($validated);
            $company->save();

            return $company->refresh();
        });
    }
}
