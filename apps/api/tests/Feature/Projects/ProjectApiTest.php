<?php

namespace Tests\Feature\Projects;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Enums\CompanyRole;
use App\Models\Budget;
use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Projects\Concerns\InteractsWithProjects;
use Tests\TestCase;

/**
 * PROJECT-API-01 §56-57/§62. P1-P12 (CRUD), PT1-PT10 (multitenancy),
 * PD1-PD6 (dates).
 */
class ProjectApiTest extends TestCase
{
    use InteractsWithProjects, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/projects';

    // ============================= P1-P12 =============================

    /** P1: unauthenticated -> 401. */
    public function test_p1_unauthenticated_create_is_rejected(): void
    {
        $this->postJson(self::ENDPOINT, ['name' => 'Obra', 'customer_id' => 'x'])->assertStatus(401);
    }

    /** P2: an authenticated user with zero Company memberships fails closed (403), never "return everything". */
    public function test_p2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson(self::ENDPOINT, ['name' => 'Obra', 'customer_id' => 'x'])->assertStatus(403);
    }

    /** P3: create with only the required fields. */
    public function test_p3_create_minimal(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);
        $response->assertJsonPath('name', 'Reforma Residencial');
    }

    /** P4: a newly-created Project always starts as planning. */
    public function test_p4_created_status_is_planning(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('status', 'planning');
    }

    /** P5: the server allocates the human-facing number. */
    public function test_p5_server_generates_number(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('number', 'OBR-000001');
    }

    /** P6: a second Project in the same Company gets the next number. */
    public function test_p6_second_project_gets_next_number(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('number', 'OBR-000002');
    }

    /** P7: sequences are isolated per Company. */
    public function test_p7_sequence_isolated_per_company(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('number', 'OBR-000001');
    }

    /** P8: GET detail. */
    public function test_p8_get_detail(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json('id');

        $this->getJson(self::ENDPOINT."/{$id}")
            ->assertOk()
            ->assertJsonPath('id', $id);
    }

    /** P9: update name/reference. */
    public function test_p9_update_name_and_reference(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'name' => 'Reforma Atualizada',
            'reference' => 'Nova referência',
            'updated_at' => $created['updated_at'],
        ])->assertOk()
            ->assertJsonPath('name', 'Reforma Atualizada')
            ->assertJsonPath('reference', 'Nova referência');
    }

    /** P10: update status. */
    public function test_p10_update_status(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'status' => 'in_progress',
            'updated_at' => $created['updated_at'],
        ])->assertOk()->assertJsonPath('status', 'in_progress');
    }

    /** P11: an invalid status value is rejected. */
    public function test_p11_invalid_status_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'status' => 'not-a-real-status',
            'updated_at' => $created['updated_at'],
        ])->assertStatus(422);
    }

    /** P12: there is no DELETE route for Project in v1. */
    public function test_p12_no_delete_route(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->deleteJson(self::ENDPOINT."/{$created['id']}")->assertStatus(405);
    }

    // ============================= PT1-PT10 =============================

    /** PT1: a Project from Company A is invisible to Company B's list. */
    public function test_pt1_project_a_invisible_to_b(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload())->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonCount(0, 'data');
    }

    /** PT2: route-model binding on a cross-tenant id is 404, never 403. */
    public function test_pt2_cross_tenant_show_is_404(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json('id');

        $this->actingAsNewCompanyMember();
        $this->getJson(self::ENDPOINT."/{$id}")->assertStatus(404);
    }

    /** PT3: a Customer from Company B is rejected when creating a Project in Company A. */
    public function test_pt3_customer_from_other_company_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $foreignCustomerId = $this->makeCustomer()->id;

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_id' => $foreignCustomerId]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_id');
    }

    /** PT4: a CustomerAddress from another Company/Customer is rejected. */
    public function test_pt4_foreign_customer_address_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $foreignAddress = $this->currentCompanyContext()->run(
            $this->activeTestCompany,
            fn () => CustomerAddress::factory()->for($customer)->create()
        );

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['customer_address_id' => $foreignAddress->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_address_id');
    }

    /** PT5: a Budget from another Company is rejected as source_budget_id. */
    public function test_pt5_foreign_source_budget_rejected(): void
    {
        $this->actingAsNewCompanyMember();
        [$budget] = $this->approvedBudgetFixture($this->activeTestCompany);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['source_budget_id' => $budget->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('source_budget_id');
    }

    /** PT6: index only ever returns the active Company's Projects. */
    public function test_pt6_index_only_current_company(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra A']))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra B']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT)->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Obra B', $response->json('data.0.name'));
    }

    /** PT7: search never leaks a Customer name from another Company. */
    public function test_pt7_search_does_not_leak_other_company_customer(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Alfa']))->assertStatus(201);

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['name' => 'Obra Beta']))->assertStatus(201);

        $response = $this->getJson(self::ENDPOINT.'?search=Alfa')->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    /** PT8: updating a Project from another Company is impossible (404 before any write). */
    public function test_pt8_cross_tenant_update_impossible(): void
    {
        $this->actingAsNewCompanyMember();
        $created = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->actingAsNewCompanyMember();
        $this->putJson(self::ENDPOINT."/{$created['id']}", [
            'name' => 'Hackeado',
            'updated_at' => $created['updated_at'],
        ])->assertStatus(404);
    }

    /** PT9: number sequences never collide across Companies. */
    public function test_pt9_number_sequences_isolated(): void
    {
        $this->actingAsNewCompanyMember();
        $a = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->actingAsNewCompanyMember();
        $b = $this->postJson(self::ENDPOINT, $this->validProjectPayload())->json();

        $this->assertSame('OBR-000001', $a['number']);
        $this->assertSame('OBR-000001', $b['number']);
    }

    /** PT10: company_id is a hostile field — always prohibited. */
    public function test_pt10_company_id_is_prohibited(): void
    {
        $this->actingAsNewCompanyMember();
        $otherCompany = Company::factory()->create();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['company_id' => $otherCompany->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_id');
    }

    // ============================= PD1-PD6 =============================

    /** PD1: expected_start_date accepts Y-m-d. */
    public function test_pd1_start_date_y_m_d(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['expected_start_date' => '2026-10-01']))
            ->assertStatus(201)
            ->assertJsonPath('expected_start_date', '2026-10-01');
    }

    /** PD2: expected_end_date accepts Y-m-d. */
    public function test_pd2_end_date_y_m_d(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['expected_end_date' => '2026-12-31']))
            ->assertStatus(201)
            ->assertJsonPath('expected_end_date', '2026-12-31');
    }

    /** PD3: both dates may be null. */
    public function test_pd3_dates_may_be_null(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload())
            ->assertStatus(201)
            ->assertJsonPath('expected_start_date', null)
            ->assertJsonPath('expected_end_date', null);
    }

    /** PD4: an invalid date format is rejected. */
    public function test_pd4_invalid_date_format_rejected(): void
    {
        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validProjectPayload(['expected_start_date' => '01/10/2026']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('expected_start_date');
    }

    /** PD5: the Resource returns date-only strings, never a timestamp. */
    public function test_pd5_resource_returns_date_only(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validProjectPayload(['expected_start_date' => '2026-10-01']))
            ->assertStatus(201);

        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $response->json('expected_start_date'));
    }

    /** PD6: no timezone conversion is ever applied to a date-only field. */
    public function test_pd6_no_timezone_conversion(): void
    {
        $this->actingAsNewCompanyMember();
        $id = $this->postJson(self::ENDPOINT, $this->validProjectPayload(['expected_start_date' => '2026-01-01']))->json('id');

        $this->getJson(self::ENDPOINT."/{$id}")->assertJsonPath('expected_start_date', '2026-01-01');
    }

    /**
     * @return array{0: Budget, 1: Customer}
     */
    private function approvedBudgetFixture(Company $company, ?Customer $customer = null): array
    {
        $customer ??= $this->makeCustomer();
        $user = User::factory()->create();
        $company->memberships()->create(['user_id' => $user->id, 'role' => CompanyRole::Owner]);

        $budget = $this->currentCompanyContext()->run($company, function () use ($customer, $user) {
            $budget = app(BudgetService::class)->create([
                'customer_id' => $customer->id, 'title' => 'Orçamento aprovado',
            ], $user);
            app(BudgetItemService::class)->addItem($budget, [
                'source_type' => 'manual', 'name' => 'Item', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '100.00',
            ]);
            $budget = app(BudgetService::class)->submit($budget);

            return app(BudgetService::class)->approveManually($budget, $user);
        });

        return [$budget, $customer];
    }
}
