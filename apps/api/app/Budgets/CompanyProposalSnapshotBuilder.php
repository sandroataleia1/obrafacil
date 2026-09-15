<?php

namespace App\Budgets;

use App\Models\Company;

/**
 * PROPOSAL-DOC-01A §3/§49: the ONE place that builds the `company_snapshot`
 * array shape — used both by `BudgetService::submit()` (persisted, frozen
 * forever) and by the authenticated draft-preview PDF flow (built fresh
 * from the LIVE Company every time, never persisted). A single structural
 * source avoids the array shape drifting between `BudgetService`,
 * `PublicProposalResource`, `BudgetResource`, and the PDF ViewModel.
 *
 * Deliberately excludes `company_id`, `logo_path` (the logo is its own
 * separate immutable-copy concern — see `BudgetProposalLogoService`), and
 * timestamps — a snapshot is a plain identity/contact/address/regional
 * fact sheet, never a reference back to the live row.
 */
class CompanyProposalSnapshotBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(Company $company): array
    {
        return [
            'name' => $company->name,
            'legal_name' => $company->legal_name,
            'trade_name' => $company->trade_name,
            'document' => $company->document,
            'phone' => $company->phone,
            'whatsapp' => $company->whatsapp,
            'email' => $company->email,
            'address' => [
                'postal_code' => $company->postal_code,
                'street' => $company->street,
                'number' => $company->number,
                'complement' => $company->complement,
                'neighborhood' => $company->neighborhood,
                'city' => $company->city,
                'state' => $company->state,
                'reference_point' => $company->reference_point,
            ],
            'timezone' => $company->timezone,
        ];
    }
}
