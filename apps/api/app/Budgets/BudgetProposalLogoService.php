<?php

namespace App\Budgets;

use App\Budgets\Exceptions\ProposalLogoCopyException;
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
     *                                      set but the source file is
     *                                      actually missing from disk
     *                                      (§9/PROPOSAL-DOC-01A1 §13 —
     *                                      unchanged, a client-facing 422).
     * @throws ProposalLogoCopyException when the source exists but the
     *                                   write of the immutable copy
     *                                   itself fails (PROPOSAL-DOC-01A1
     *                                   §4/§8) — a SERVER failure, never
     *                                   a 422.
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

        // PROPOSAL-DOC-01A1 §4/§8: the `public` disk is configured with
        // `throw=false` (config/filesystems.php) — a failed write is
        // never an exception to catch here, only a falsy return to
        // check. `copy()` (not get()+put()) is the Filesystem operation
        // actually meant for this — same-disk, and its boolean return is
        // exactly what `throw=false` produces on failure, so this never
        // relies on `throw=true` to detect a bad write.
        $copied = Storage::disk(self::DISK)->copy($company->logo_path, $newPath);

        if ($copied !== true) {
            // §7: never leave a partial/failed write behind as an orphan.
            Storage::disk(self::DISK)->delete($newPath);

            throw new ProposalLogoCopyException(
                "Failed to copy company logo [{$company->logo_path}] to proposal path [{$newPath}]."
            );
        }

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
