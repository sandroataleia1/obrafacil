<?php

namespace Tests\Feature\Lookups;

use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Providers\ViaCepPostalCodeProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Every test here uses Http::fake() — no real request ever leaves this
 * process. Fixture response shapes match the real ViaCEP contract audited
 * 2026-09-10 (see ADR-009), never invented field names.
 */
class ViaCepPostalCodeProviderTest extends TestCase
{
    private function provider(int $timeoutSeconds = 5): ViaCepPostalCodeProvider
    {
        return new ViaCepPostalCodeProvider(baseUrl: 'https://viacep.test', timeoutSeconds: $timeoutSeconds);
    }

    /** V1: a valid CEP builds the correct URL. */
    public function test_v1_valid_cep_builds_the_correct_url(): void
    {
        Http::fake(['viacep.test/*' => Http::response(['logradouro' => 'Rua X', 'localidade' => 'Y', 'uf' => 'SP'], 200)]);

        $this->provider()->lookup('01001000');

        Http::assertSent(fn ($request) => $request->url() === 'https://viacep.test/ws/01001000/json/'
            && $request->method() === 'GET');
    }

    /** V2: sends Accept: application/json. */
    public function test_v2_sends_accept_json(): void
    {
        Http::fake(['*' => Http::response(['logradouro' => 'Rua X', 'localidade' => 'Y', 'uf' => 'SP'], 200)]);

        $this->provider()->lookup('01001000');

        Http::assertSent(fn ($request) => $request->hasHeader('Accept', 'application/json'));
    }

    /** V3: a successful response maps street/neighborhood/city/state. */
    public function test_v3_success_maps_fields(): void
    {
        Http::fake(['*' => Http::response([
            'cep' => '01001-000',
            'logradouro' => 'Praça da Sé',
            'bairro' => 'Sé',
            'localidade' => 'São Paulo',
            'uf' => 'sp',
            'complemento' => 'lado ímpar',
        ], 200)]);

        $result = $this->provider()->lookup('01001000');

        $this->assertSame('Praça da Sé', $result->street);
        $this->assertSame('Sé', $result->neighborhood);
        $this->assertSame('São Paulo', $result->city);
        $this->assertSame('SP', $result->state);
        $this->assertSame('lado ímpar', $result->providerComplement);
    }

    /** V4: the response's CEP is normalized to 8 digits. */
    public function test_v4_response_cep_normalized_to_8_digits(): void
    {
        Http::fake(['*' => Http::response([
            'cep' => '01001-000', 'logradouro' => 'X', 'localidade' => 'Y', 'uf' => 'SP',
        ], 200)]);

        $result = $this->provider()->lookup('01001000');

        $this->assertSame('01001000', $result->postalCode);
    }

    /** V5: erro=true -> LookupNotFoundException. */
    public function test_v5_erro_true_is_not_found(): void
    {
        Http::fake(['*' => Http::response(['erro' => 'true'], 200)]);

        $this->expectException(LookupNotFoundException::class);
        $this->provider()->lookup('99999999');
    }

    /** V6: an upstream HTTP 400 never becomes a raw/passthrough response. */
    public function test_v6_upstream_400_is_controlled(): void
    {
        Http::fake(['*' => Http::response('Bad Request', 400)]);

        $this->expectException(LookupInvalidResponseException::class);
        $this->provider()->lookup('01001000');
    }

    /** V7: an upstream HTTP 500 -> unavailable. */
    public function test_v7_upstream_500_is_unavailable(): void
    {
        Http::fake(['*' => Http::response('Internal Server Error', 500)]);

        $this->expectException(LookupUnavailableException::class);
        $this->provider()->lookup('01001000');
    }

    /** V8: a timeout/connection failure -> unavailable. */
    public function test_v8_connection_failure_is_unavailable(): void
    {
        Http::fake(['*' => Http::failedConnection('cURL error 28: Operation timed out after 5000 milliseconds')]);

        $this->expectException(LookupUnavailableException::class);
        $this->provider()->lookup('01001000');
    }

    /** V9: incomplete JSON missing essential fields -> invalid response. */
    public function test_v9_incomplete_essential_fields_is_invalid_response(): void
    {
        Http::fake(['*' => Http::response(['logradouro' => 'X'], 200)]);

        $this->expectException(LookupInvalidResponseException::class);
        $this->provider()->lookup('01001000');
    }

    /** V10: an empty string field becomes null. */
    public function test_v10_empty_string_becomes_null(): void
    {
        Http::fake(['*' => Http::response([
            'logradouro' => '', 'bairro' => '', 'localidade' => 'Y', 'uf' => 'SP', 'complemento' => '',
        ], 200)]);

        $result = $this->provider()->lookup('01001000');

        $this->assertNull($result->street);
        $this->assertNull($result->neighborhood);
        $this->assertNull($result->providerComplement);
    }
}
