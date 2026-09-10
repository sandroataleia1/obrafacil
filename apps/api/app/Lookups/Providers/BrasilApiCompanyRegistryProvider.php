<?php

namespace App\Lookups\Providers;

use App\Lookups\Contracts\CompanyRegistryProvider;
use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Support\CompanyRegistryAddress;
use App\Lookups\Support\CompanyRegistryLookupResult;
use App\Support\Document;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Adapter for BrasilAPI's `GET /cnpj/v1/{cnpj}` (audited 2026-09-10 — see
 * ADR-009 for the exact fields observed against a real, public CNPJ). Only
 * this class knows BrasilAPI's response shape — CompanyRegistryLookupResult
 * is what everything else sees. Deliberately ignores `qsa`, `capital_social`,
 * `cnaes_secundarios`, `regime_tributario`, and every other field not
 * useful for Customer registration (§5).
 */
class BrasilApiCompanyRegistryProvider implements CompanyRegistryProvider
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly int $timeoutSeconds,
    ) {}

    public function lookup(string $document): CompanyRegistryLookupResult
    {
        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
                'User-Agent' => 'ObraFacil/1.0 (+https://obrafacil.app)',
            ])
                ->timeout($this->timeoutSeconds)
                ->get(rtrim($this->baseUrl, '/')."/cnpj/v1/{$document}");
        } catch (ConnectionException $e) {
            Log::warning('lookup.provider.unavailable', [
                'provider' => 'brasilapi',
                'lookup_type' => 'cnpj',
                'exception' => $e::class,
            ]);

            throw new LookupUnavailableException('BrasilAPI is unreachable.', previous: $e);
        }

        if ($response->status() === 404) {
            throw new LookupNotFoundException('CNPJ não encontrado.');
        }

        // §20: the format/check-digits were already validated locally
        // before this call — a 400 here means BrasilAPI disagreed, an
        // unexpected response rather than a case our client caused.
        if ($response->status() === 400) {
            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'brasilapi',
                'lookup_type' => 'cnpj',
                'status' => $response->status(),
            ]);

            throw new LookupInvalidResponseException('BrasilAPI rejected the request format.');
        }

        if (! $response->successful()) {
            Log::warning('lookup.provider.unavailable', [
                'provider' => 'brasilapi',
                'lookup_type' => 'cnpj',
                'status' => $response->status(),
            ]);

            throw new LookupUnavailableException("BrasilAPI returned status {$response->status()}.");
        }

        $data = $response->json();
        if (! is_array($data)) {
            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'brasilapi',
                'lookup_type' => 'cnpj',
            ]);

            throw new LookupInvalidResponseException('BrasilAPI returned a non-JSON response.');
        }

        $legalName = $this->nullableTrim($data['razao_social'] ?? null);
        if ($legalName === null) {
            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'brasilapi',
                'lookup_type' => 'cnpj',
            ]);

            throw new LookupInvalidResponseException('BrasilAPI response missing essential fields.');
        }

        $state = $this->nullableTrim($data['uf'] ?? null);

        return new CompanyRegistryLookupResult(
            document: Document::digitsOnly($data['cnpj'] ?? null) ?? $document,
            legalName: $legalName,
            tradeName: $this->nullableTrim($data['nome_fantasia'] ?? null),
            phone: $this->extractPhone($data['ddd_telefone_1'] ?? null),
            email: $this->extractEmail($data['email'] ?? null),
            address: new CompanyRegistryAddress(
                postalCode: Document::digitsOnly($data['cep'] ?? null),
                street: $this->nullableTrim($data['logradouro'] ?? null),
                number: $this->nullableTrim($data['numero'] ?? null),
                complement: $this->nullableTrim($data['complemento'] ?? null),
                neighborhood: $this->nullableTrim($data['bairro'] ?? null),
                city: $this->nullableTrim($data['municipio'] ?? null),
                state: $state !== null ? Str::upper($state) : null,
            ),
        );
    }

    /**
     * §15: BrasilAPI's `ddd_telefone_1` is DDD+number concatenated with no
     * separator (e.g. "1123851939") — only a clean 10 (DDD+fixed) or 11
     * (DDD+mobile) digit value is converted to E.164. Anything shorter,
     * longer, or non-numeric becomes null rather than a fabricated number.
     */
    private function extractPhone(mixed $raw): ?string
    {
        if (! is_string($raw)) {
            return null;
        }

        $digits = Document::digitsOnly($raw);
        if ($digits === null || ! in_array(strlen($digits), [10, 11], true)) {
            return null;
        }

        return '+55'.$digits;
    }

    /** §16: an invalid/empty provider email becomes null, never a hard failure of the whole lookup. */
    private function extractEmail(mixed $raw): ?string
    {
        if (! is_string($raw)) {
            return null;
        }

        $normalized = Str::lower(trim($raw));
        if ($normalized === '' || ! filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            return null;
        }

        return $normalized;
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
