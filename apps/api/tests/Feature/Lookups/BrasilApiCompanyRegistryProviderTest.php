<?php

namespace Tests\Feature\Lookups;

use App\Lookups\Exceptions\LookupInvalidResponseException;
use App\Lookups\Exceptions\LookupNotFoundException;
use App\Lookups\Exceptions\LookupUnavailableException;
use App\Lookups\Providers\BrasilApiCompanyRegistryProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Every test here uses Http::fake() — no real request ever leaves this
 * process. Fixture response shapes match the real BrasilAPI contract
 * audited 2026-09-10 against a real, public CNPJ (see ADR-009), never
 * invented field names.
 */
class BrasilApiCompanyRegistryProviderTest extends TestCase
{
    /** A trimmed-down but real-shaped fixture — same field names/format as the actual audited response. */
    private const array REAL_SHAPE_FIXTURE = [
        'cnpj' => '19131243000197',
        'razao_social' => 'OPEN KNOWLEDGE BRASIL',
        'nome_fantasia' => 'REDE PELO CONHECIMENTO LIVRE',
        'email' => null,
        'ddd_telefone_1' => '1123851939',
        'ddd_telefone_2' => '',
        'cep' => '01311902',
        'logradouro' => 'PAULISTA 37',
        'numero' => '37',
        'complemento' => 'ANDAR 4',
        'bairro' => 'BELA VISTA',
        'municipio' => 'SAO PAULO',
        'uf' => 'sp',
        // deliberately included to prove these are never consumed:
        'qsa' => [['nome_socio' => 'Someone']],
        'capital_social' => 0,
        'cnaes_secundarios' => [['codigo' => 123, 'descricao' => 'X']],
    ];

    private function provider(int $timeoutSeconds = 5): BrasilApiCompanyRegistryProvider
    {
        return new BrasilApiCompanyRegistryProvider(baseUrl: 'https://brasilapi.test/api', timeoutSeconds: $timeoutSeconds);
    }

    /** B1: a canonical CNPJ builds the correct endpoint. */
    public function test_b1_canonical_cnpj_builds_correct_endpoint(): void
    {
        Http::fake(['brasilapi.test/*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $this->provider()->lookup('19131243000197');

        Http::assertSent(fn ($request) => $request->url() === 'https://brasilapi.test/api/cnpj/v1/19131243000197'
            && $request->method() === 'GET');
    }

    /** B2: sends Accept: application/json. */
    public function test_b2_sends_accept_json(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $this->provider()->lookup('19131243000197');

        Http::assertSent(fn ($request) => $request->hasHeader('Accept', 'application/json'));
    }

    /** B3: sends a stable User-Agent. */
    public function test_b3_sends_user_agent(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $this->provider()->lookup('19131243000197');

        Http::assertSent(fn ($request) => str_contains($request->header('User-Agent')[0] ?? '', 'ObraFacil'));
    }

    /** B4: legal_name is mapped from the real razao_social field. */
    public function test_b4_legal_name_mapped(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('OPEN KNOWLEDGE BRASIL', $result->legalName);
    }

    /** B5: trade_name is mapped from the real nome_fantasia field. */
    public function test_b5_trade_name_mapped(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('REDE PELO CONHECIMENTO LIVRE', $result->tradeName);
    }

    /** B6: the CEP inside the address is normalized to 8 digits. */
    public function test_b6_address_cep_normalized(): void
    {
        Http::fake(['*' => Http::response(array_merge(self::REAL_SHAPE_FIXTURE, ['cep' => '01311-902']), 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('01311902', $result->address->postalCode);
    }

    /** B7: the UF is uppercased. */
    public function test_b7_uf_uppercased(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('SP', $result->address->state);
    }

    /** B8: the full address is mapped. */
    public function test_b8_address_mapped(): void
    {
        Http::fake(['*' => Http::response(self::REAL_SHAPE_FIXTURE, 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('PAULISTA 37', $result->address->street);
        $this->assertSame('37', $result->address->number);
        $this->assertSame('ANDAR 4', $result->address->complement);
        $this->assertSame('BELA VISTA', $result->address->neighborhood);
        $this->assertSame('SAO PAULO', $result->address->city);
    }

    /** B9: a 10-digit national phone becomes E.164. */
    public function test_b9_national_phone_becomes_e164(): void
    {
        Http::fake(['*' => Http::response(array_merge(self::REAL_SHAPE_FIXTURE, ['ddd_telefone_1' => '1123851939']), 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('+551123851939', $result->phone);
    }

    /** B10: an ambiguous/invalid phone becomes null. */
    public function test_b10_ambiguous_phone_becomes_null(): void
    {
        Http::fake(['*' => Http::response(array_merge(self::REAL_SHAPE_FIXTURE, ['ddd_telefone_1' => '123']), 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertNull($result->phone);
    }

    /** B11: email is normalized lowercase/trim. */
    public function test_b11_email_normalized(): void
    {
        Http::fake(['*' => Http::response(array_merge(self::REAL_SHAPE_FIXTURE, ['email' => '  Contato@EMPRESA.com.br  ']), 200)]);

        $result = $this->provider()->lookup('19131243000197');

        $this->assertSame('contato@empresa.com.br', $result->email);
    }

    /** B12: a 404 -> not found. */
    public function test_b12_404_is_not_found(): void
    {
        Http::fake(['*' => Http::response(['message' => 'CNPJ não encontrado.', 'type' => 'not_found', 'name' => 'NotFoundError'], 404)]);

        $this->expectException(LookupNotFoundException::class);
        $this->provider()->lookup('00000000000000');
    }

    /** B13: 5xx/connection failure -> unavailable. */
    public function test_b13_server_error_is_unavailable(): void
    {
        Http::fake(['*' => Http::response('Internal Server Error', 500)]);

        $this->expectException(LookupUnavailableException::class);
        $this->provider()->lookup('19131243000197');
    }

    /** B13b: a connection failure is also unavailable. */
    public function test_b13b_connection_failure_is_unavailable(): void
    {
        Http::fake(['*' => Http::failedConnection('cURL error 28: Operation timed out after 5000 milliseconds')]);

        $this->expectException(LookupUnavailableException::class);
        $this->provider()->lookup('19131243000197');
    }

    /** B14: an unexpected payload (missing legal name) -> controlled invalid response. */
    public function test_b14_unexpected_payload_is_invalid_response(): void
    {
        Http::fake(['*' => Http::response(['cnpj' => '19131243000197'], 200)]);

        $this->expectException(LookupInvalidResponseException::class);
        $this->provider()->lookup('19131243000197');
    }
}
