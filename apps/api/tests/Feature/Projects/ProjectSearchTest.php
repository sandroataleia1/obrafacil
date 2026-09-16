<?php

namespace Tests\Feature\Projects;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §41-43/§61. PS1-PS8.
 */
class ProjectSearchTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    /** PS1: search matches Project.name. */
    public function test_ps1_search_by_project_name(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Reforma da Cozinha']))->assertStatus(201);
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Construção de Piscina']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=Cozinha')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Reforma da Cozinha', $response->json('data.0.name'));
    }

    /** PS2: search matches the related Customer's name. */
    public function test_ps2_search_by_customer_name(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer(['name' => 'Fernanda Lima']);
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => $customer->id, 'name' => 'Obra X']))->assertStatus(201);
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Y']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=Fernanda')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Obra X', $response->json('data.0.name'));
    }

    /** PS3: search is case-insensitive (ILIKE-based). */
    public function test_ps3_search_is_case_insensitive(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Reforma da Cozinha']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=COZINHA')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** PS4: status filter narrows results. */
    public function test_ps4_status_filter(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();
        $this->putJson(self::ENDPOINT."/{$created['id']}", ['status' => 'completed', 'updated_at' => $created['updated_at']])->assertOk();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?status=completed')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('completed', $response->json('data.0.status'));
    }

    /** PS5: search combined with status filter. */
    public function test_ps5_search_and_status_combined(): void
    {
        $this->actingAsNewCompanyMember();
        $a = $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Alfa']))->json();
        $this->putJson(self::ENDPOINT."/{$a['id']}", ['status' => 'paused', 'updated_at' => $a['updated_at']])->assertOk();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Alfa 2']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=Alfa&status=paused')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    /** PS6: pagination works. */
    public function test_ps6_pagination(): void
    {
        $this->actingAsNewCompanyMember();
        for ($i = 0; $i < 3; $i++) {
            $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => "Obra {$i}"]))->assertStatus(201);
        }

        $response = $this->getJson(self::ENDPOINT.'?per_page=2&page=1')->assertOk();
        $this->assertCount(2, $response->json('data'));
        $this->assertSame(3, $response->json('meta.total'));

        $response2 = $this->getJson(self::ENDPOINT.'?per_page=2&page=2')->assertOk();
        $this->assertCount(1, $response2->json('data'));
    }

    /** PS7: per_page is clamped to a sane maximum, never a validation error. */
    public function test_ps7_per_page_clamped(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?per_page=99999')->assertOk();
        $this->assertSame(100, $response->json('meta.per_page'));
    }

    /** PS8: results never include another Company's Projects, even matching by search term. */
    public function test_ps8_no_unrelated_company_results(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Compartilhada']))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Compartilhada']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=Compartilhada')->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
