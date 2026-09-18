<?php

namespace Tests\Feature\PurchaseOrders;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §74, PO1-PO20.
 */
class PurchaseOrderApiTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ENDPOINT = '/api/v1/purchase-orders';

    /** PO1: unauthenticated -> 401. */
    public function test_po1_unauthenticated_is_rejected(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
        $this->postJson(self::ENDPOINT, [])->assertStatus(401);
    }

    /** PO2: authenticated with zero memberships -> fail-closed 403. */
    public function test_po2_no_active_company_fails_closed(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson(self::ENDPOINT)->assertStatus(403);
    }

    /** PO3: create draft. */
    public function test_po3_create_draft(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload());

        $response->assertCreated()->assertJsonPath('commercial_status', 'draft');
    }

    /** PO4: server-authoritative company_id/number/commercial_status. */
    public function test_po4_server_authoritative_fields(): void
    {
        [$company] = $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload([
            'commercial_status' => 'ordered',
        ]))->assertStatus(422)->assertJsonValidationErrors('commercial_status');

        $ok = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->assertCreated();
        $ok->assertJsonMissingPath('company_id');
        $this->assertDatabaseHas('purchase_orders', ['id' => $ok->json('id'), 'company_id' => $company->id, 'commercial_status' => 'draft']);
    }

    /** PO5: PC-000001 formatting. */
    public function test_po5_pc_number_formatting(): void
    {
        $this->actingAsNewCompanyMember();

        $response = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload());

        $response->assertJsonPath('number', 'PC-000001');
    }

    /** PO6: sequence isolated per Company. */
    public function test_po6_sequence_isolated_per_company(): void
    {
        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->assertJsonPath('number', 'PC-000001');

        $this->actingAsNewCompanyMember();
        $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->assertJsonPath('number', 'PC-000001');
    }

    /** PO7: Supplier active is required on create. */
    public function test_po7_supplier_active_required_on_create(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $inactiveSupplier = $this->makeSupplierForCompany($company, ['active' => false]);

        $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload(['supplier_id' => $inactiveSupplier->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('supplier_id');
    }

    /** PO8: a valid same-tenant Project resolves correctly. */
    public function test_po8_project_tenant_valid(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company, ['name' => 'Reforma Cozinha']);

        $response = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload(['project_id' => $project->id]));

        $response->assertCreated()->assertJsonPath('project.id', $project->id)->assertJsonPath('project.name', 'Reforma Cozinha');
    }

    /** PO9: a cross-tenant Supplier is rejected. */
    public function test_po9_supplier_cross_tenant_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $supplierA = $this->makeSupplierForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload(['supplier_id' => $supplierA->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('supplier_id');
    }

    /** PO10: a cross-tenant Project is rejected. */
    public function test_po10_project_cross_tenant_rejected(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $projectA = $this->makeProjectForCompany($companyA);

        $this->actingAsNewCompanyMember();

        $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload(['project_id' => $projectA->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('project_id');
    }

    /** PO11: list and detail. */
    public function test_po11_list_and_detail(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->makePurchaseOrderForCompany($company);

        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonCount(1, 'data');
        $this->getJson(self::ENDPOINT."/{$order->id}")->assertOk()->assertJsonPath('id', $order->id);
    }

    /** PO12: search by Supplier name. */
    public function test_po12_search_by_supplier_name(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $supplierA = $this->makeSupplierForCompany($company, ['name' => 'Depósito Alfa']);
        $supplierB = $this->makeSupplierForCompany($company, ['name' => 'Depósito Beta']);
        $this->makePurchaseOrderForCompany($company, ['supplier_id' => $supplierA->id]);
        $this->makePurchaseOrderForCompany($company, ['supplier_id' => $supplierB->id]);

        $response = $this->getJson(self::ENDPOINT.'?search=Alfa')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Depósito Alfa', $response->json('data.0.supplier.name'));
    }

    /** PO13: search by Project name. */
    public function test_po13_search_by_project_name(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($company, ['name' => 'Reforma Alfa']);
        $projectB = $this->makeProjectForCompany($company, ['name' => 'Reforma Beta']);
        $this->makePurchaseOrderForCompany($company, ['project_id' => $projectA->id]);
        $this->makePurchaseOrderForCompany($company, ['project_id' => $projectB->id]);

        $response = $this->getJson(self::ENDPOINT.'?search=Alfa')->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Reforma Alfa', $response->json('data.0.project.name'));
    }

    /** PO14: search by PC number. */
    public function test_po14_search_by_pc_number(): void
    {
        $this->actingAsNewCompanyMember();

        $orderA = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $orderB = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();

        $response = $this->getJson(self::ENDPOINT.'?search='.$orderA['number'])->assertOk();
        $numbers = collect($response->json('data'))->pluck('number');
        $this->assertTrue($numbers->contains($orderA['number']));
        $this->assertFalse($numbers->contains($orderB['number']));
    }

    /** PO15: status/project/supplier filters. */
    public function test_po15_status_project_supplier_filters(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($company);
        $supplierA = $this->makeSupplierForCompany($company);
        $orderDraft = $this->makePurchaseOrderForCompany($company, ['project_id' => $projectA->id, 'supplier_id' => $supplierA->id]);
        $orderCancelled = $this->makePurchaseOrderForCompany($company, ['commercial_status' => 'cancelled']);

        $byStatus = $this->getJson(self::ENDPOINT.'?commercial_status=draft')->assertOk();
        $this->assertTrue(collect($byStatus->json('data'))->pluck('id')->contains($orderDraft->id));
        $this->assertFalse(collect($byStatus->json('data'))->pluck('id')->contains($orderCancelled->id));

        $byProject = $this->getJson(self::ENDPOINT."?project_id={$projectA->id}")->assertOk();
        $this->assertCount(1, $byProject->json('data'));

        $bySupplier = $this->getJson(self::ENDPOINT."?supplier_id={$supplierA->id}")->assertOk();
        $this->assertCount(1, $bySupplier->json('data'));
    }

    /** PO16: draft header is editable (supplier/project/dates/notes). */
    public function test_po16_draft_header_edit(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();

        $newSupplier = $this->makeSupplierForCompany($company);
        $newProject = $this->makeProjectForCompany($company);

        $response = $this->putJson(self::ENDPOINT."/{$order['id']}", [
            'supplier_id' => $newSupplier->id,
            'project_id' => $newProject->id,
            'order_date' => '2026-01-15',
            'expected_delivery_date' => '2026-02-01',
            'notes' => 'Atualizado',
            'updated_at' => $order['updated_at'],
        ]);

        $response->assertOk()
            ->assertJsonPath('supplier.id', $newSupplier->id)
            ->assertJsonPath('project.id', $newProject->id)
            ->assertJsonPath('order_date', '2026-01-15')
            ->assertJsonPath('notes', 'Atualizado');
    }

    /** PO17: ordered — identity fields (supplier/project/order_date) are locked. */
    public function test_po17_ordered_identity_fields_locked(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $this->postJson(self::ENDPOINT."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $confirmed = $this->postJson(self::ENDPOINT."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])->json();

        $otherSupplier = $this->makeSupplierForCompany($company);

        $this->putJson(self::ENDPOINT."/{$order['id']}", [
            'supplier_id' => $otherSupplier->id,
            'project_id' => $confirmed['project']['id'],
            'order_date' => $confirmed['order_date'],
            'updated_at' => $confirmed['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('supplier_id');

        // expected_delivery_date/notes remain editable while ordered.
        $this->putJson(self::ENDPOINT."/{$order['id']}", [
            'supplier_id' => $confirmed['supplier']['id'],
            'project_id' => $confirmed['project']['id'],
            'order_date' => $confirmed['order_date'],
            'expected_delivery_date' => '2026-03-01',
            'notes' => 'Nota do pedido confirmado',
            'updated_at' => $confirmed['updated_at'],
        ])->assertOk()->assertJsonPath('expected_delivery_date', '2026-03-01');
    }

    /** PO18: cancelled — any header edit attempt is 422. */
    public function test_po18_cancelled_header_is_read_only(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson(self::ENDPOINT."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->putJson(self::ENDPOINT."/{$order['id']}", [
            'supplier_id' => $cancelled['supplier']['id'],
            'project_id' => $cancelled['project']['id'],
            'order_date' => $cancelled['order_date'],
            'notes' => 'Tentativa de edição',
            'updated_at' => $cancelled['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }

    /** PO19: draft delete succeeds, even with items. */
    public function test_po19_draft_delete_succeeds_with_items(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $this->postJson(self::ENDPOINT."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();

        $this->deleteJson(self::ENDPOINT."/{$order['id']}", ['updated_at' => $order['updated_at']])->assertNoContent();

        $this->assertDatabaseMissing('purchase_orders', ['id' => $order['id']]);
        $this->assertDatabaseMissing('purchase_order_items', ['purchase_order_id' => $order['id']]);
    }

    /** PO20: ordered/cancelled delete is blocked. */
    public function test_po20_ordered_and_cancelled_delete_blocked(): void
    {
        $this->actingAsNewCompanyMember();

        $orderedOrder = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $this->postJson(self::ENDPOINT."/{$orderedOrder['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $ordered = $this->postJson(self::ENDPOINT."/{$orderedOrder['id']}/confirm", ['updated_at' => $orderedOrder['updated_at']])->json();

        $this->deleteJson(self::ENDPOINT."/{$ordered['id']}", ['updated_at' => $ordered['updated_at']])
            ->assertStatus(422)->assertJsonValidationErrors('commercial_status');

        $cancelledOrder = $this->postJson(self::ENDPOINT, $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson(self::ENDPOINT."/{$cancelledOrder['id']}/cancel", ['updated_at' => $cancelledOrder['updated_at']])->json();

        $this->deleteJson(self::ENDPOINT."/{$cancelled['id']}", ['updated_at' => $cancelled['updated_at']])
            ->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }
}
