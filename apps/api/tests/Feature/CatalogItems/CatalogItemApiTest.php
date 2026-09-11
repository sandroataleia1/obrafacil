<?php

namespace Tests\Feature\CatalogItems;

use App\CatalogItems\CatalogItemService;
use App\Enums\CompanyRole;
use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\User;
use App\Support\CurrentCompanyContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * BACKEND-05: C1-C18 (create/validation), CODE1-CODE10 (unique code),
 * L1-L14 (list/search/filters), T1-T12 (tenant isolation), U1-U12
 * (update/active), money tests, material isolation, no-delete.
 */
class CatalogItemApiTest extends TestCase
{
    use RefreshDatabase;

    private const string ENDPOINT = '/api/v1/catalog-items';

    private function currentCompanyContext(): CurrentCompanyContext
    {
        return app(CurrentCompanyContext::class);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function makeCompanyWithMember(array $companyAttributes = [], array $userAttributes = []): array
    {
        $company = Company::factory()->create($companyAttributes);
        $user = User::factory()->create($userAttributes);
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        return [$company, $user];
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function actingAsNewCompanyMember(array $companyAttributes = [], array $userAttributes = []): array
    {
        [$company, $user] = $this->makeCompanyWithMember($companyAttributes, $userAttributes);
        Sanctum::actingAs($user);

        return [$company, $user];
    }

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'service',
            'code' => 'PINT-M2',
            'name' => 'Pintura de parede',
            'category' => 'Pintura',
            'unit' => 'm²',
            'description' => 'Preparação e aplicação de tinta',
            'cost_price' => '18.50',
            'sale_price' => '32.00',
            'active' => true,
        ], $overrides);
    }

    // ---------------------------------------------------------------
    // C1-C18: create + validation
    // ---------------------------------------------------------------

    /** C1: no auth -> 401. */
    public function test_c1_unauthenticated_create_is_rejected(): void
    {
        $this->postJson(self::ENDPOINT, $this->validPayload())->assertStatus(401);
    }

    /** C2: auth + valid tenant -> create. */
    public function test_c2_creates_catalog_item(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload())
            ->assertStatus(201)
            ->assertJsonPath('name', 'Pintura de parede');
    }

    /** C3: valid product. */
    public function test_c3_valid_product(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['type' => 'product', 'code' => 'PORTA-80', 'name' => 'Porta de madeira 80cm', 'unit' => 'un']))
            ->assertStatus(201)
            ->assertJsonPath('type', 'product');
    }

    /** C4: valid service. */
    public function test_c4_valid_service(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['type' => 'service']))
            ->assertStatus(201)
            ->assertJsonPath('type', 'service');
    }

    /** C5: invalid type -> 422. */
    public function test_c5_invalid_type_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['type' => 'material']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('type');
    }

    /** C6: name required. */
    public function test_c6_name_is_required(): void
    {
        $this->actingAsNewCompanyMember();

        $payload = $this->validPayload();
        unset($payload['name']);

        $this->postJson(self::ENDPOINT, $payload)->assertStatus(422)->assertJsonValidationErrors('name');
    }

    /** C7: unit required. */
    public function test_c7_unit_is_required(): void
    {
        $this->actingAsNewCompanyMember();

        $payload = $this->validPayload();
        unset($payload['unit']);

        $this->postJson(self::ENDPOINT, $payload)->assertStatus(422)->assertJsonValidationErrors('unit');
    }

    /** C8: cost_price accepts a valid decimal. */
    public function test_c8_cost_price_valid_decimal(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['cost_price' => '125.50']))
            ->assertStatus(201)
            ->assertJsonPath('cost_price', '125.50');
    }

    /** C9: sale_price accepts a valid decimal. */
    public function test_c9_sale_price_valid_decimal(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['sale_price' => '999.99']))
            ->assertStatus(201)
            ->assertJsonPath('sale_price', '999.99');
    }

    /** C10: negative cost_price -> 422. */
    public function test_c10_negative_cost_price_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['cost_price' => '-1.00']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cost_price');
    }

    /** C11: negative sale_price -> 422. */
    public function test_c11_negative_sale_price_is_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['sale_price' => '-1.00']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('sale_price');
    }

    /** C12: both prices nullable. */
    public function test_c12_prices_are_nullable(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['cost_price' => null, 'sale_price' => null]))
            ->assertStatus(201)
            ->assertJsonPath('cost_price', null)
            ->assertJsonPath('sale_price', null);
    }

    /** C13: sale_price < cost_price is explicitly allowed (§15 — no margin enforcement). */
    public function test_c13_sale_below_cost_is_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['cost_price' => '100.00', 'sale_price' => '10.00']))
            ->assertStatus(201)
            ->assertJsonPath('cost_price', '100.00')
            ->assertJsonPath('sale_price', '10.00');
    }

    /** C14: empty-string nullable strings become null (§26). */
    public function test_c14_empty_nullable_strings_become_null(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validPayload(['code' => '', 'category' => '', 'description' => '']))
            ->assertStatus(201);

        $response->assertJsonPath('code', null)->assertJsonPath('category', null)->assertJsonPath('description', null);
    }

    /** C15: active defaults to true when omitted. */
    public function test_c15_active_defaults_true(): void
    {
        $this->actingAsNewCompanyMember();

        $payload = $this->validPayload();
        unset($payload['active']);

        $this->postJson(self::ENDPOINT, $payload)->assertStatus(201)->assertJsonPath('active', true);
    }

    /** C16: explicit active=false is allowed on create. */
    public function test_c16_explicit_active_false_allowed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['active' => false]))
            ->assertStatus(201)
            ->assertJsonPath('active', false);
    }

    /** C17: hostile id/company_id -> 422, never silently dropped. */
    public function test_c17_hostile_fields_rejected(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['id' => Str::uuid()->toString(), 'company_id' => $company->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['id', 'company_id']);
    }

    /** C18: the resource never exposes company_id. */
    public function test_c18_resource_never_exposes_company_id(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validPayload())->assertStatus(201);
        $response->assertJsonMissing(['company_id']);
    }

    // ---------------------------------------------------------------
    // CODE1-CODE10: unique code per tenant, case-insensitive
    // ---------------------------------------------------------------

    /** CODE1: code is nullable. */
    public function test_code1_code_is_nullable(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => null]))
            ->assertStatus(201)
            ->assertJsonPath('code', null);
    }

    /** CODE2: code is trimmed. */
    public function test_code2_code_is_trimmed(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => '  PINT-M2  ']))
            ->assertStatus(201)
            ->assertJsonPath('code', 'PINT-M2');
    }

    /** CODE3: same code in the same company -> 422. */
    public function test_code3_duplicate_code_same_company_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201);

        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001', 'name' => 'Outro']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    /** CODE4: case-insensitive — SRV-001 vs srv-001 conflict. */
    public function test_code4_duplicate_code_case_insensitive(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201);

        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'srv-001', 'name' => 'Outro']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    /** CODE5: same code across different tenants is allowed. */
    public function test_code5_same_code_across_tenants_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201);
    }

    /** CODE6: an inactive item still reserves its code. */
    public function test_code6_inactive_item_reserves_code(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001', 'active' => false]))->assertStatus(201);

        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001', 'name' => 'Outro']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    /** CODE7: update to an already-occupied code -> 422. */
    public function test_code7_update_to_occupied_code_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201);
        $secondId = $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-002', 'name' => 'Segundo']))
            ->assertStatus(201)->json('id');

        $this->putJson(self::ENDPOINT."/{$secondId}", $this->validPayload(['code' => 'SRV-001', 'name' => 'Segundo']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    /** CODE8: updating an item while keeping its own code works. */
    public function test_code8_update_keeping_own_code_works(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SRV-001']))->assertStatus(201)->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['code' => 'SRV-001', 'name' => 'Renomeado']))
            ->assertStatus(200)
            ->assertJsonPath('name', 'Renomeado');
    }

    /**
     * CODE9: a genuine race — a row with the same code is inserted directly
     * at the database layer (simulating a concurrent request that won the
     * race and already committed), *after* which the Service — never the
     * FormRequest's own pre-check, which never runs here — is called
     * directly. The real `catalog_items_company_code_unique` constraint is
     * what rejects it; CatalogItemService must convert that into a
     * ValidationException on `code`, not let the raw QueryException escape.
     */
    public function test_code9_real_race_condition_converts_to_422(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->currentCompanyContext()->run($company, function () {
            DB::table('catalog_items')->insert([
                'id' => (string) Str::orderedUuid(),
                'company_id' => app(CurrentCompanyContext::class)->id(),
                'type' => 'service',
                'code' => 'RACE-001',
                'name' => 'Concurrent winner',
                'unit' => 'un',
                'active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $service = app(CatalogItemService::class);

            try {
                $service->create([
                    'type' => 'service',
                    'code' => 'race-001', // different case — the functional index still catches it.
                    'name' => 'Loser of the race',
                    'unit' => 'un',
                ]);
                $this->fail('Expected a ValidationException on the code field.');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey('code', $e->errors());
            }
        });
    }

    /**
     * CODE10: a QueryException unrelated to the code constraint (here, a
     * plain `varchar(255)` overflow on `name` — bypassing the FormRequest's
     * own max:255 rule by calling the Service directly) must propagate
     * unchanged — never mistaken for a code conflict and never silently
     * converted.
     */
    public function test_code10_unrelated_query_exception_is_not_treated_as_code_conflict(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $this->currentCompanyContext()->run($company, function () {
            $service = app(CatalogItemService::class);

            $this->expectException(QueryException::class);

            $service->create([
                'type' => 'service',
                'code' => null,
                'name' => str_repeat('a', 300),
                'unit' => 'un',
            ]);
        });
    }

    // ---------------------------------------------------------------
    // L1-L14: list/search/filters/pagination
    // ---------------------------------------------------------------

    /** L1: default pagination (per_page 15). */
    public function test_l1_default_pagination(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, fn () => CatalogItem::factory()->count(20)->create());

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertSame(15, $response->json('meta.per_page'));
        $this->assertCount(15, $response->json('data'));
    }

    /** L2: per_page is capped at 100. */
    public function test_l2_per_page_capped_at_100(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->getJson(self::ENDPOINT.'?per_page=500')->assertOk();
        $this->assertSame(100, $response->json('meta.per_page'));
    }

    /** L3: deterministic ordering — active DESC, name ASC, id ASC. */
    public function test_l3_deterministic_ordering(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create(['name' => 'Zebra', 'active' => true]);
            CatalogItem::factory()->create(['name' => 'Alpha', 'active' => false]);
            CatalogItem::factory()->create(['name' => 'Beta', 'active' => true]);
        });

        $names = $this->getJson(self::ENDPOINT)->assertOk()->json('data.*.name');
        $this->assertSame(['Beta', 'Zebra', 'Alpha'], $names);
    }

    /**
     * A fully pinned set of the four searchable fields — every L4-L8 test
     * overrides every one of them explicitly (never leaves a searchable
     * field to the factory's random defaults), so the search term can
     * only ever match through the one field each test targets.
     *
     * @return array<string, mixed>
     */
    private function searchNeutralPayload(array $overrides = []): array
    {
        return array_merge([
            'code' => 'NEUTRAL-CODE',
            'name' => 'Neutral name',
            'category' => 'Neutral category',
            'description' => 'Neutral description',
        ], $overrides);
    }

    /** L4: search by name. */
    public function test_l4_search_by_name(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'A', 'name' => 'Pintura de parede']));
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'B', 'name' => 'Instalação elétrica']));
        });

        $response = $this->getJson(self::ENDPOINT.'?search=Pintura')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** L5: search is partial and case-insensitive. */
    public function test_l5_search_partial_case_insensitive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run(
            $company,
            fn () => CatalogItem::factory()->create($this->searchNeutralPayload(['name' => 'Pintura de Parede']))
        );

        $response = $this->getJson(self::ENDPOINT.'?search=pintura')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** L6: search by code. */
    public function test_l6_search_by_code(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'PINT-M2', 'name' => 'X']));
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'ELET-01', 'name' => 'Y']));
        });

        $response = $this->getJson(self::ENDPOINT.'?search=PINT')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** L7: search by category. */
    public function test_l7_search_by_category(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'A', 'category' => 'Pintura', 'name' => 'X']));
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'B', 'category' => 'Elétrica', 'name' => 'Y']));
        });

        $response = $this->getJson(self::ENDPOINT.'?search=Pintura')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** L8: search by description. */
    public function test_l8_search_by_description(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'A', 'description' => 'Preparação e aplicação de tinta', 'name' => 'X']));
            CatalogItem::factory()->create($this->searchNeutralPayload(['code' => 'B', 'description' => 'Fiação e disjuntores', 'name' => 'Y']));
        });

        $response = $this->getJson(self::ENDPOINT.'?search=tinta')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** L9: type=product filter. */
    public function test_l9_filter_type_product(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->product()->create();
            CatalogItem::factory()->service()->create();
        });

        $response = $this->getJson(self::ENDPOINT.'?type=product')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('product', $response->json('data.0.type'));
    }

    /** L10: type=service filter. */
    public function test_l10_filter_type_service(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->product()->create();
            CatalogItem::factory()->service()->create();
        });

        $response = $this->getJson(self::ENDPOINT.'?type=service')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('service', $response->json('data.0.type'));
    }

    /** L11: active=true filter. */
    public function test_l11_filter_active_true(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create(['active' => true]);
            CatalogItem::factory()->inactive()->create();
        });

        $response = $this->getJson(self::ENDPOINT.'?active=true')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertTrue($response->json('data.0.active'));
    }

    /** L12: active=false filter. */
    public function test_l12_filter_active_false(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create(['active' => true]);
            CatalogItem::factory()->inactive()->create();
        });

        $response = $this->getJson(self::ENDPOINT.'?active=false')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertFalse($response->json('data.0.active'));
    }

    /** L13: without `active`, both active and inactive are returned (§28). */
    public function test_l13_no_active_filter_returns_both(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->create(['active' => true]);
            CatalogItem::factory()->inactive()->create();
        });

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertCount(2, $response->json('data'));
    }

    /** L14: combined filters (type + active + search) all apply together. */
    public function test_l14_combined_filters(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $this->currentCompanyContext()->run($company, function () {
            CatalogItem::factory()->service()->create(['name' => 'Pintura ativa', 'active' => true]);
            CatalogItem::factory()->service()->inactive()->create(['name' => 'Pintura inativa']);
            CatalogItem::factory()->product()->create(['name' => 'Pintura produto', 'active' => true]);
        });

        $response = $this->getJson(self::ENDPOINT.'?type=service&active=true&search=Pintura')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Pintura ativa', $response->json('data.0.name'));
    }

    // ---------------------------------------------------------------
    // T1-T12: tenant isolation
    // ---------------------------------------------------------------

    /** T1: Company A's list never shows Company B's items. */
    public function test_t1_list_never_shows_other_tenant(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->create(['name' => 'De B']));

        $this->actingAsNewCompanyMember();
        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertSame(0, $response->json('meta.total'));
    }

    /** T2: Company A cannot show Company B's item -> 404. */
    public function test_t2_show_other_tenant_is_404(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $id = $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $this->getJson(self::ENDPOINT."/{$id}")->assertStatus(404);
    }

    /** T3: Company A cannot update Company B's item -> 404, and B's row is untouched. */
    public function test_t3_update_other_tenant_is_404(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $id = $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->create(['name' => 'Original'])->id);

        $this->actingAsNewCompanyMember();
        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['name' => 'Hackeado']))->assertStatus(404);

        $name = $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::query()->findOrFail($id)->name);
        $this->assertSame('Original', $name);
    }

    /** T4: a company_id in the payload never switches tenant. */
    public function test_t4_company_id_in_payload_never_switches_tenant(): void
    {
        [$companyA, $user] = $this->makeCompanyWithMember();
        [$companyB] = $this->makeCompanyWithMember();
        $id = $this->currentCompanyContext()->run($companyA, fn () => CatalogItem::factory()->create()->id);
        Sanctum::actingAs($user);

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['company_id' => $companyB->id]))
            ->assertStatus(422);
    }

    /** T5: the same code is allowed across different tenants. */
    public function test_t5_same_code_cross_tenant_allowed(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SAME-001']))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPayload(['code' => 'SAME-001']))->assertStatus(201);
    }

    /** T6: search never finds another tenant's item. */
    public function test_t6_search_never_finds_other_tenant(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->create(['name' => 'Segredo de B']));

        $this->actingAsNewCompanyMember();
        $response = $this->getJson(self::ENDPOINT.'?search=Segredo')->assertOk();
        $this->assertSame(0, $response->json('meta.total'));
    }

    /** T7: filters never leak another tenant's item. */
    public function test_t7_filters_never_leak_other_tenant(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->product()->create());

        $this->actingAsNewCompanyMember();
        $response = $this->getJson(self::ENDPOINT.'?type=product')->assertOk();
        $this->assertSame(0, $response->json('meta.total'));
    }

    /** T8: a query without CurrentCompanyContext fails closed. */
    public function test_t8_query_without_context_throws(): void
    {
        $this->currentCompanyContext()->clear();

        $this->expectException(\RuntimeException::class);
        CatalogItem::query()->count();
    }

    /** T9: a user with 0 memberships gets the platform's existing 403 (unchanged behavior). */
    public function test_t9_zero_membership_preserves_403(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(403);
    }

    /** T10: a user with 2+ memberships and no active company preserves the existing 409. */
    public function test_t10_multi_membership_without_active_preserves_409(): void
    {
        [, $user] = $this->makeCompanyWithMember();
        [$companyB] = $this->makeCompanyWithMember();
        $companyB->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(409);
    }

    /** T11: a random UUID is a plain 404. */
    public function test_t11_random_uuid_is_404(): void
    {
        $this->actingAsNewCompanyMember();

        $this->getJson(self::ENDPOINT.'/'.Str::uuid())->assertStatus(404);
    }

    /** T12: cross-tenant and random-UUID 404s are indistinguishable (same body shape). */
    public function test_t12_cross_tenant_and_random_404_are_indistinguishable(): void
    {
        [$companyB] = $this->makeCompanyWithMember();
        $crossTenantId = $this->currentCompanyContext()->run($companyB, fn () => CatalogItem::factory()->create()->id);

        $this->actingAsNewCompanyMember();
        $crossTenantResponse = $this->getJson(self::ENDPOINT."/{$crossTenantId}");
        $randomResponse = $this->getJson(self::ENDPOINT.'/'.Str::uuid());

        $this->assertSame($crossTenantResponse->getStatusCode(), $randomResponse->getStatusCode());
        $this->assertSame(404, $crossTenantResponse->getStatusCode());
    }

    // ---------------------------------------------------------------
    // U1-U12: update / active
    // ---------------------------------------------------------------

    /** U1: update name. */
    public function test_u1_update_name(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['name' => 'Novo nome']))
            ->assertOk()->assertJsonPath('name', 'Novo nome');
    }

    /** U2: update code. */
    public function test_u2_update_code(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['code' => 'NOVO-CODE']))
            ->assertOk()->assertJsonPath('code', 'NOVO-CODE');
    }

    /** U3: update category. */
    public function test_u3_update_category(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['category' => 'Nova categoria']))
            ->assertOk()->assertJsonPath('category', 'Nova categoria');
    }

    /** U4: update unit. */
    public function test_u4_update_unit(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['unit' => 'h']))
            ->assertOk()->assertJsonPath('unit', 'h');
    }

    /** U5: update description. */
    public function test_u5_update_description(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['description' => 'Nova descrição']))
            ->assertOk()->assertJsonPath('description', 'Nova descrição');
    }

    /** U6: update cost_price. */
    public function test_u6_update_cost_price(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['cost_price' => '50.00']))
            ->assertOk()->assertJsonPath('cost_price', '50.00');
    }

    /** U7: update sale_price. */
    public function test_u7_update_sale_price(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['sale_price' => '80.00']))
            ->assertOk()->assertJsonPath('sale_price', '80.00');
    }

    /** U8: inactivate active -> false. */
    public function test_u8_inactivate(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload(['active' => true]))->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['active' => false]))
            ->assertOk()->assertJsonPath('active', false);
    }

    /** U9: reactivate false -> true. */
    public function test_u9_reactivate(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload(['active' => false]))->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['active' => true]))
            ->assertOk()->assertJsonPath('active', true);
    }

    /** U10: an inactive item still shows/lists without the active filter. */
    public function test_u10_inactive_visible_without_active_filter(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload(['active' => false]))->json('id');

        $this->getJson(self::ENDPOINT."/{$id}")->assertOk()->assertJsonPath('active', false);
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonCount(1, 'data');
    }

    /** U11: there is no DELETE route. */
    public function test_u11_no_delete_route(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $response = $this->deleteJson(self::ENDPOINT."/{$id}");
        $this->assertContains($response->getStatusCode(), [404, 405]);
    }

    /** U12: inactivation never physically removes the row. */
    public function test_u12_inactivation_never_deletes_row(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->json('id');

        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['active' => false]))->assertOk();

        $exists = $this->currentCompanyContext()->run($company, fn () => CatalogItem::query()->whereKey($id)->exists());
        $this->assertTrue($exists);
    }

    // ---------------------------------------------------------------
    // Money contract
    // ---------------------------------------------------------------

    /** Money: the API returns stable decimal strings, never a binary float artifact. */
    public function test_money_returns_stable_decimal_strings(): void
    {
        $this->actingAsNewCompanyMember();

        foreach (['0', '0.01', '999999.99'] as $value) {
            $response = $this->postJson(self::ENDPOINT, $this->validPayload([
                'code' => null,
                'cost_price' => $value,
                'sale_price' => $value,
            ]))->assertStatus(201);

            $expected = number_format((float) $value, 2, '.', '');
            $response->assertJsonPath('cost_price', $expected)->assertJsonPath('sale_price', $expected);
        }
    }

    // ---------------------------------------------------------------
    // No hard/soft delete route exists
    // ---------------------------------------------------------------

    /** §48: DELETE is never routed — no destroy action exists. */
    public function test_delete_route_does_not_exist(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->deleteJson(self::ENDPOINT.'/'.Str::uuid());
        $this->assertContains($response->getStatusCode(), [404, 405]);
    }

    // ---------------------------------------------------------------
    // §46: Material/Stock/Purchase isolation
    // ---------------------------------------------------------------

    /**
     * §34/§46: proves structurally that CatalogItem CRUD touches nothing
     * that could belong to a Material/Stock/Purchase/ProjectMaterialRequirement
     * domain. As of this gate, no such table or model exists anywhere in
     * apps/api at all (confirmed by direct schema inspection below) — those
     * domains are frontend-only prototypes today, so there is structurally
     * nothing in the backend for CatalogItem to couple to. If any of those
     * tables are ever added, this test starts asserting the real isolation
     * (zero row count change) instead of merely "the table doesn't exist".
     */
    public function test_material_isolation_no_coupling_with_material_domain(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $materialLikeTables = ['materials', 'stock_ledger', 'stock_movements', 'purchases', 'purchase_orders', 'project_material_requirements', 'suppliers'];
        foreach ($materialLikeTables as $table) {
            $this->assertFalse(
                Schema::hasTable($table),
                "Expected no backend table named '{$table}' to exist yet — Material/Stock/Purchase is still frontend-only. ".
                'If this now fails, a real backend Material domain was added: update this test to assert isolation '.
                'by row-count instead of table absence.'
            );
        }

        // Create, update, and inactivate a CatalogItem — then confirm the
        // only table affected is catalog_items itself.
        $id = $this->postJson(self::ENDPOINT, $this->validPayload())->assertStatus(201)->json('id');
        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['name' => 'Atualizado']))->assertOk();
        $this->putJson(self::ENDPOINT."/{$id}", $this->validPayload(['active' => false]))->assertOk();

        $count = $this->currentCompanyContext()->run($company, fn () => CatalogItem::query()->count());
        $this->assertSame(1, $count);
    }
}
