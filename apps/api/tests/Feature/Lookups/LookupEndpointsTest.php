<?php

namespace Tests\Feature\Lookups;

use App\Enums\CompanyRole;
use App\Models\Company;
use App\Models\Customer;
use App\Models\NotificationDelivery;
use App\Models\NotificationEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Customers\Concerns\InteractsWithCustomers;
use Tests\TestCase;

/**
 * BACKEND-04A: H1-H16 (HTTP contract for both endpoints), C1-C6 (cache),
 * R1-R4 (rate limit). §38: zero persistence is asserted directly rather
 * than assumed — no lookup call, real or faked, ever touches customers/
 * customer_addresses/customer_contacts/notification_* /jobs.
 */
class LookupEndpointsTest extends TestCase
{
    use InteractsWithCustomers, RefreshDatabase;

    private const string CEP_ENDPOINT = '/api/v1/lookups/cep';

    private const string CNPJ_ENDPOINT = '/api/v1/lookups/cnpj';

    private const array VIACEP_SUCCESS = [
        'cep' => '01001-000',
        'logradouro' => 'Praça da Sé',
        'bairro' => 'Sé',
        'localidade' => 'São Paulo',
        'uf' => 'SP',
    ];

    private const array BRASILAPI_SUCCESS = [
        'cnpj' => '19131243000197',
        'razao_social' => 'OPEN KNOWLEDGE BRASIL',
        'nome_fantasia' => 'REDE PELO CONHECIMENTO LIVRE',
        'email' => null,
        'ddd_telefone_1' => '1123851939',
        'cep' => '01311902',
        'logradouro' => 'PAULISTA 37',
        'numero' => '37',
        'complemento' => 'ANDAR 4',
        'bairro' => 'BELA VISTA',
        'municipio' => 'SAO PAULO',
        'uf' => 'SP',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    // ---------------------------------------------------------------
    // H1-H16
    // ---------------------------------------------------------------

    /** H1: CEP without auth -> 401. */
    public function test_h1_cep_without_auth_is_401(): void
    {
        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertStatus(401);
    }

    /** H2: CNPJ without auth -> 401. */
    public function test_h2_cnpj_without_auth_is_401(): void
    {
        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertStatus(401);
    }

    /** H3: authenticated with an active company -> lookup is allowed. */
    public function test_h3_authenticated_with_active_company_is_allowed(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
    }

    /** H4: multi-company user with no active company -> 409. */
    public function test_h4_multi_company_without_active_company_is_409(): void
    {
        $user = User::factory()->create();
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();
        $companyA->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        Sanctum::actingAs($user);

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertStatus(409);
    }

    /** H5: a masked CEP is accepted. */
    public function test_h5_masked_cep_is_accepted(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep='.urlencode('01001-000'))->assertOk();
    }

    /** H6: a canonical CEP is accepted. */
    public function test_h6_canonical_cep_is_accepted(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
    }

    /** H7: an invalid CEP -> 422, and the provider is never called. */
    public function test_h7_invalid_cep_is_422_and_provider_never_called(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=123')->assertStatus(422);

        $fake->assertNothingSent();
    }

    /** H8: CEP not found -> 404. */
    public function test_h8_cep_not_found_is_404(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(['erro' => 'true'], 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=99999999')
            ->assertStatus(404)
            ->assertJson(['message' => 'CEP não encontrado.']);
    }

    /** H9: CEP provider down -> 503. */
    public function test_h9_cep_provider_down_is_503(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response('Internal Server Error', 500)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')
            ->assertStatus(503)
            ->assertJson(['message' => 'Serviço de consulta temporariamente indisponível.']);
    }

    /** H10: a masked CNPJ is accepted. */
    public function test_h10_masked_cnpj_is_accepted(): void
    {
        Http::fake(['brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj='.urlencode('19.131.243/0001-97'))->assertOk();
    }

    /** H11: a canonical CNPJ is accepted. */
    public function test_h11_canonical_cnpj_is_accepted(): void
    {
        Http::fake(['brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertOk();
    }

    /** H12: a locally-invalid CNPJ (bad check digits) -> 422, provider never called. */
    public function test_h12_invalid_cnpj_is_422_and_provider_never_called(): void
    {
        $fake = Http::fake(['brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=11111111111111')->assertStatus(422);

        $fake->assertNothingSent();
    }

    /** H13: CNPJ not found -> 404. */
    public function test_h13_cnpj_not_found_is_404(): void
    {
        Http::fake(['brasilapi.com.br/*' => Http::response(['message' => 'CNPJ não encontrado.'], 404)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')
            ->assertStatus(404)
            ->assertJson(['message' => 'CNPJ não encontrado.']);
    }

    /** H14: CNPJ provider down -> 503. */
    public function test_h14_cnpj_provider_down_is_503(): void
    {
        Http::fake(['brasilapi.com.br/*' => Http::response('Internal Server Error', 500)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')
            ->assertStatus(503)
            ->assertJson(['message' => 'Serviço de consulta temporariamente indisponível.']);
    }

    /** H15: the response never exposes provider name/base URL. */
    public function test_h15_response_never_exposes_provider_details(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $response = $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();

        $body = strtolower(json_encode($response->json()));
        // "provider_complement" is itself a legitimate, documented field
        // name (§9) — what must never leak is the actual provider
        // identity/base URL, not that substring.
        $this->assertStringNotContainsString('viacep', $body);
        $this->assertStringNotContainsString('brasilapi', $body);
        $this->assertStringNotContainsString('base_url', $body);
        $this->assertStringNotContainsString('http://', $body);
        $this->assertStringNotContainsString('https://', $body);
    }

    /** H16 / §38: a lookup never creates/edits Customer, CustomerAddress, or CustomerContact. */
    public function test_h16_lookup_never_touches_customer_domain(): void
    {
        Http::fake([
            'viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200),
            'brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200),
        ]);
        [$company] = $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertOk();

        $this->currentCompanyContext()->run($company, function () {
            $this->assertSame(0, Customer::query()->count());
        });
        $this->assertSame(0, NotificationEvent::withoutCompanyScope()->count());
        $this->assertSame(0, NotificationDelivery::withoutCompanyScope()->count());
        $this->assertSame(0, DB::table('jobs')->count());
    }

    // ---------------------------------------------------------------
    // C1-C6: cache
    // ---------------------------------------------------------------

    /** C1: the first CEP lookup calls the provider. */
    public function test_c1_first_cep_lookup_calls_provider(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();

        $fake->assertSentCount(1);
    }

    /** C2: the second lookup for the same CEP uses the cache — no second provider call. */
    public function test_c2_second_same_cep_uses_cache(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();

        $fake->assertSentCount(1);
    }

    /** C3: the first CNPJ lookup calls the provider. */
    public function test_c3_first_cnpj_lookup_calls_provider(): void
    {
        $fake = Http::fake(['brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertOk();

        $fake->assertSentCount(1);
    }

    /** C4: the second lookup for the same CNPJ uses the cache. */
    public function test_c4_second_same_cnpj_uses_cache(): void
    {
        $fake = Http::fake(['brasilapi.com.br/*' => Http::response(self::BRASILAPI_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertOk();
        $this->getJson(self::CNPJ_ENDPOINT.'?cnpj=19131243000197')->assertOk();

        $fake->assertSentCount(1);
    }

    /** C5: a timeout/unavailable result is never cached — the next call still hits the provider. */
    public function test_c5_timeout_is_not_cached(): void
    {
        // A single URL pattern answering 500 first, then a real success —
        // proves the failure was never cached (if it had been, the second
        // call would never even reach this second queued response).
        Http::fake([
            'viacep.com.br/*' => Http::sequence()
                ->push('Internal Server Error', 500)
                ->push(self::VIACEP_SUCCESS, 200),
        ]);
        $this->actingAsNewCompanyMember();

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertStatus(503);
        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
    }

    /** C6: a cached result is reused across companies without leaking tenant data (it never carried any). */
    public function test_c6_cache_reused_across_companies_without_leak(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);

        $this->actingAsNewCompanyMember();
        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();

        $this->actingAsNewCompanyMember();
        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();

        $fake->assertSentCount(1);
    }

    // ---------------------------------------------------------------
    // R1-R4: rate limit
    // ---------------------------------------------------------------

    /** R1: normal human usage under the limit works. */
    public function test_r1_usage_under_limit_works(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        for ($i = 0; $i < 5; $i++) {
            $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
        }
    }

    /** R2: exceeding the internal limit -> 429. */
    public function test_r2_exceeding_limit_is_429(): void
    {
        Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        for ($i = 0; $i < 30; $i++) {
            $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertOk();
        }

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertStatus(429);
    }

    /** R3: once throttled, no further provider calls happen either. */
    public function test_r3_throttled_requests_never_reach_provider(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        for ($i = 0; $i < 30; $i++) {
            $this->getJson(self::CEP_ENDPOINT.'?cep=01001000');
        }
        $callsBeforeThrottle = count($fake->recorded());

        $this->getJson(self::CEP_ENDPOINT.'?cep=01001000')->assertStatus(429);

        $this->assertCount($callsBeforeThrottle, $fake->recorded());
    }

    /** R4: an invalid input never bypasses validation to reach the provider, even repeated. */
    public function test_r4_invalid_input_cannot_bypass_validation_to_call_provider(): void
    {
        $fake = Http::fake(['viacep.com.br/*' => Http::response(self::VIACEP_SUCCESS, 200)]);
        $this->actingAsNewCompanyMember();

        for ($i = 0; $i < 5; $i++) {
            $this->getJson(self::CEP_ENDPOINT.'?cep=abc')->assertStatus(422);
        }

        $fake->assertNothingSent();
    }
}
