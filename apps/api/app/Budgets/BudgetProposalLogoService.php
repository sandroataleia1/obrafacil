<?php

namespace App\Budgets;

use App\Budgets\Exceptions\ProposalLogoMissingException;
use App\Models\Budget;
use App\Models\Company;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * PROPOSAL-DOC-01A §4-9: copies the Company's CURRENT logo file into a
 * path owned by the Budget itself, at submit time — never a snapshot of
 * `Company.logo_path` alone. `CompanyLogoService` deletes the old file
 * whenever the Company replaces/removes its logo, which would silently
 * corrupt every historical proposal document if they merely pointed at
 * the live `logo_path`. The copy is a real, independent file; once made,
 * nothing the Company profile does afterward (replace, remove) ever
 * touches it (§6).
 */
class BudgetProposalLogoService
{
    private const DISK = 'public';

    /**
     * @return string|null the new, Budget-owned path, or null when the
     *                     Company has no logo at all (§3: not every
     *                     Company has one — never blocks submit).
     *
     * @throws ProposalLogoMissingException when `Company.logo_path` is
     *                                      set but the file is actually
     *                                      missing from disk (§9).
     */
    public function copyFromCompany(Budget $budget, Company $company): ?string
    {
        if ($company->logo_path === null) {
            return null;
        }

        if (! Storage::disk(self::DISK)->exists($company->logo_path)) {
            throw new ProposalLogoMissingException(
                'A logo cadastrada da empresa não está disponível. Reenvie a logo antes de disponibilizar a proposta.'
            );
        }

        $extension = pathinfo($company->logo_path, PATHINFO_EXTENSION) ?: 'bin';
        $newPath = "companies/{$company->id}/proposals/{$budget->id}/".Str::uuid()->toString().'.'.$extension;

        $contents = Storage::disk(self::DISK)->get($company->logo_path);
        Storage::disk(self::DISK)->put($newPath, $contents);

        return $newPath;
    }

    /**
     * §8: filesystem writes aren't transactional — if anything after the
     * copy prevents the Budget row from actually committing, the
     * just-copied file must be removed so it never becomes an orphan.
     */
    public function deleteCopy(string $path): void
    {
        Storage::disk(self::DISK)->delete($path);
    }
}
