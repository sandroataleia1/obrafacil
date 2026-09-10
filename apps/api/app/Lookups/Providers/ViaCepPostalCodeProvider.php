<?php

namespace App\Lookups\Providers;

use App\Lookups\Contracts\PostalCodeProvider;
use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Support\PostalCodeLookupResult;
use App\Support\Document;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Adapter for ViaCEP's `GET /ws/{cep}/json/` (audited 2026-09-10, see
 * ADR-009 for the exact fields observed). Only this class knows ViaCEP's
 * response shape — PostalCodeLookupResult is what everything else sees.
 */
class ViaCepPostalCodeProvider implements PostalCodeProvider
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly int $timeoutSeconds,
    ) {}

    public function lookup(string $postalCode): PostalCodeLookupResult
    {
        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
                'User-Agent' => 'ObraFacil/1.0 (+https://obrafacil.app)',
            ])
                ->timeout($this->timeoutSeconds)
                ->get(rtrim($this->baseUrl, '/')."/ws/{$postalCode}/json/");
        } catch (ConnectionException $e) {
            Log::warning('lookup.provider.unavailable', [
                'provider' => 'viacep',
                'lookup_type' => 'cep',
                'exception' => $e::class,
            ]);

            throw new LookupUnavailableException('ViaCEP is unreachable.', previous: $e);
        }

        // §19: the format was already validated locally before this call
        // ever happens — a 400 here means ViaCEP disagreed with our own
        // validation, which is itself an unexpected/unreliable response,
        // not a case our client is responsible for causing.
        if ($response->status() === 400) {
            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'viacep',
                'lookup_type' => 'cep',
                'status' => $response->status(),
            ]);

            throw new LookupInvalidResponseException('ViaCEP rejected the request format.');
        }

        if (! $response->successful()) {
            // §21/§22: 5xx and 429 both collapse into "unavailable" — no
            // retry loop, no raw upstream body ever returned.
            Log::warning('lookup.provider.unavailable', [
                'provider' => 'viacep',
                'lookup_type' => 'cep',
                'status' => $response->status(),
            ]);

            throw new LookupUnavailableException("ViaCEP returned status {$response->status()}.");
        }

        $data = $response->json();

        // ViaCEP returns `{"erro": "true"}` (a string, not a boolean) for
        // a well-formed but nonexistent CEP, and occasionally `[]` for
        // certain malformed/edge-case inputs.
        if (! is_array($data) || $data === [] || array_key_exists('erro', $data)) {
            if (is_array($data) && array_key_exists('erro', $data)) {
                throw new LookupNotFoundException('CEP não encontrado.');
            }

            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'viacep',
                'lookup_type' => 'cep',
            ]);

            throw new LookupInvalidResponseException('ViaCEP returned a non-JSON or empty response.');
        }

        $city = $this->nullableTrim($data['localidade'] ?? null);
        $state = $this->nullableTrim($data['uf'] ?? null);

        if ($city === null || $state === null) {
            Log::warning('lookup.provider.invalid_response', [
                'provider' => 'viacep',
                'lookup_type' => 'cep',
            ]);

            throw new LookupInvalidResponseException('ViaCEP response missing essential fields.');
        }

        return new PostalCodeLookupResult(
            postalCode: Document::digitsOnly($data['cep'] ?? null) ?? $postalCode,
            street: $this->nullableTrim($data['logradouro'] ?? null),
            neighborhood: $this->nullableTrim($data['bairro'] ?? null),
            city: $city,
            state: Str::upper($state),
            providerComplement: $this->nullableTrim($data['complemento'] ?? null),
        );
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
