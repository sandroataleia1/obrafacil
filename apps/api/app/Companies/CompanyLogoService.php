<?php

namespace App\Companies;

use App\Models\Company;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * §11-14: the logo file itself lives on the `public` Storage disk, tenant-
 * scoped and never addressable by the original uploaded filename —
 * `companies/{companyId}/logos/{uuid}.{ext}`. The database only ever holds
 * the relative `logo_path`; `CompanyProfileResource` derives `logo_url`
 * from it at read time (§14), so the disk/domain can change later without
 * a migration.
 */
class CompanyLogoService
{
    private const DISK = 'public';

    /**
     * §12: store-then-persist-then-delete-old ordering — if persisting
     * the new path fails, the just-stored file is removed so the disk
     * never accumulates orphans; the OLD file is only removed once the
     * new `logo_path` is safely committed, so a DB row never points at a
     * file that no longer exists.
     */
    public function store(Company $company, UploadedFile $file): Company
    {
        $directory = $this->directoryFor($company);
        $filename = Str::uuid()->toString().'.'.$this->extensionFor($file);

        $path = Storage::disk(self::DISK)->putFileAs($directory, $file, $filename);

        if ($path === false) {
            throw new RuntimeException('Failed to store the uploaded logo.');
        }

        $oldPath = $company->logo_path;

        try {
            $company = DB::transaction(function () use ($company, $path) {
                $company->logo_path = $path;
                $company->save();

                return $company->refresh();
            });
        } catch (Throwable $e) {
            Storage::disk(self::DISK)->delete($path);

            throw $e;
        }

        if ($oldPath !== null && $oldPath !== $path) {
            Storage::disk(self::DISK)->delete($oldPath);
        }

        return $company;
    }

    /**
     * §13: idempotent — no current logo is a normal, successful no-op,
     * never a 500.
     */
    public function delete(Company $company): Company
    {
        $oldPath = $company->logo_path;

        $company = DB::transaction(function () use ($company) {
            $company->logo_path = null;
            $company->save();

            return $company->refresh();
        });

        if ($oldPath !== null) {
            Storage::disk(self::DISK)->delete($oldPath);
        }

        return $company;
    }

    private function directoryFor(Company $company): string
    {
        return "companies/{$company->id}/logos";
    }

    private function extensionFor(UploadedFile $file): string
    {
        return match ($file->getMimeType()) {
            'image/png' => 'png',
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            default => $file->extension() ?: 'bin',
        };
    }
}
