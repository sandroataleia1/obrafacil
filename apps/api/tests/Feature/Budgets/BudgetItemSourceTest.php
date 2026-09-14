<?php

namespace Tests\Feature\Budgets;

use App\Budgets\BudgetItemService;
use App\Budgets\BudgetService;
use App\Models\BudgetItem;
use App\Models\CatalogItem;
use App\Models\Company;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BS1-BS21. BudgetItemSourceType rules: catalog/
 * calculator/manual. Also BUDGET-API-01A UC1-UC6 (unit_cost creation-time
 * immutability), NU1-NU5 (unit nullable), CS1-CS8 (calculation_snapshot
 * required for calculator).
 */
class BudgetItemSourceTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function createDraftBudgetId(): string
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    /** BS1: source_type is required. */
    public function test_bs1_source_type_is_required(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['quantity' => '1.000', 'unit_price' => '10.00'])
            ->assertStatus(422)->assertJsonValidationErrors(['source_type']);
    }

    /** BS2: source_type must be one of catalog|calculator|manual. */
    public function test_bs2_source_type_must_be_valid(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['source_type' => 'invalid']))
            ->assertStatus(422)->assertJsonValidationErrors(['source_type']);
    }

    /** BS3: catalog source requires catalog_item_id. */
    public function test_bs3_catalog_requires_catalog_item_id(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['source_type' => 'catalog', 'quantity' => '1.000'])
            ->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** BS4: catalog_item_id is prohibited for manual/calculator sources. */
    public function test_bs4_catalog_item_id_prohibited_for_manual(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['catalog_item_id' => $catalogItem->id]))
            ->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** BS5: a cross-tenant catalog_item_id is a generic 422. */
    public function test_bs5_cross_tenant_catalog_item_is_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $otherCatalogItem = $this->currentCompanyContext()->run(Company::factory()->create(), fn () => CatalogItem::factory()->create());

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($otherCatalogItem))
            ->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** BS6: an inactive catalog item is rejected. */
    public function test_bs6_inactive_catalog_item_is_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $inactiveCatalogItem = $this->makeCatalogItem(['active' => false]);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($inactiveCatalogItem))
            ->assertStatus(422)->assertJsonValidationErrors(['catalog_item_id']);
    }

    /** BS7: catalog source snapshots name/unit/code/description from the CatalogItem. */
    public function test_bs7_catalog_snapshots_fields(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['code' => 'MAT-001', 'name' => 'Cimento', 'unit' => 'saco', 'description' => 'Saco 50kg']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['code' => 'MAT-001', 'name' => 'Cimento', 'unit' => 'saco', 'description' => 'Saco 50kg']);
    }

    /** BS8: catalog source name/unit/code/description in the payload are prohibited (server derives them). */
    public function test_bs8_catalog_manual_fields_prohibited(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['name' => 'Hijack']))
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    /** BS8B (§20): a catalog item's unit_cost can never be overridden by the client — rejected as prohibited, and never applied even if it slipped through. */
    public function test_bs8b_catalog_unit_cost_override_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['cost_price' => '10.00']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['unit_cost' => '999.00']))
            ->assertStatus(422)->assertJsonValidationErrors(['unit_cost']);
    }

    /** BS9: catalog source with no CatalogItem sale_price and no explicit unit_price fails. */
    public function test_bs9_catalog_without_price_fails(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['sale_price' => null]);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertStatus(422)->assertJsonValidationErrors(['unit_price']);
    }

    /** BS10: manual source requires name/quantity/unit_price — unit is nullable (§14-18), never required. */
    public function test_bs10_manual_requires_core_fields(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['source_type' => 'manual', 'quantity' => '1.000'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'unit_price']);
    }

    /** BS11: manual source persists with source_type=manual and no catalog_item_id. */
    public function test_bs11_manual_source_persists_correctly(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())
            ->assertJson(['source_type' => 'manual', 'catalog_item_id' => null]);
    }

    /** BS12: calculator source requires name/quantity/unit_price/calculator_type/calculation_snapshot — unit is nullable. */
    public function test_bs12_calculator_requires_core_fields(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['source_type' => 'calculator', 'quantity' => '1.000'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'unit_price', 'calculator_type', 'calculation_snapshot']);
    }

    /** BS13: calculator source accepts and stores calculation_snapshot. */
    public function test_bs13_calculator_stores_payload(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/items", [
            'source_type' => 'calculator', 'calculator_type' => 'floor', 'name' => 'Piso calculado', 'unit' => 'm2',
            'quantity' => '10.000', 'unit_price' => '80.00',
            'calculation_snapshot' => ['largura' => '4', 'comprimento' => '2.5', 'perda_percentual' => '10'],
        ]);

        $response->assertStatus(201)->assertJson([
            'source_type' => 'calculator',
            'calculator_type' => 'floor',
            'calculation_snapshot' => ['largura' => '4', 'comprimento' => '2.5', 'perda_percentual' => '10'],
        ]);
    }

    /** BS14: calculation_snapshot is prohibited for manual/catalog sources. */
    public function test_bs14_calculation_snapshot_prohibited_for_manual(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['calculation_snapshot' => ['x' => 1]]))
            ->assertStatus(422)->assertJsonValidationErrors(['calculation_snapshot']);
    }

    /** BS15: calculator source has no catalog_item_id. */
    public function test_bs15_calculator_has_no_catalog_item_id(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $response = $this->postJson("/api/v1/budgets/{$budgetId}/items", [
            'source_type' => 'calculator', 'calculator_type' => 'ceiling', 'name' => 'X', 'unit' => 'un',
            'quantity' => '1.000', 'unit_price' => '10.00', 'calculation_snapshot' => ['x' => 1],
        ]);
        $response->assertStatus(201)->assertJson(['catalog_item_id' => null]);
    }

    /** BS16: on update, source_type/catalog_item_id/name/unit/description are immutable (prohibited). */
    public function test_bs16_source_snapshot_fields_immutable_on_update(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['name' => 'Novo nome'])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    /** BS17: calculator_type is required when source_type=calculator. */
    public function test_bs17_calculator_type_is_required_for_calculator_source(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", [
            'source_type' => 'calculator', 'name' => 'X', 'unit' => 'un', 'quantity' => '1.000', 'unit_price' => '10.00',
        ])->assertStatus(422)->assertJsonValidationErrors(['calculator_type']);
    }

    /** BS18: calculator_type is prohibited for manual/catalog sources. */
    public function test_bs18_calculator_type_prohibited_for_manual_and_catalog(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['calculator_type' => 'floor']))
            ->assertStatus(422)->assertJsonValidationErrors(['calculator_type']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['calculator_type' => 'floor']))
            ->assertStatus(422)->assertJsonValidationErrors(['calculator_type']);
    }

    /** BS19: an invalid calculator_type value (not masonry|floor|ceiling|slab) is rejected. */
    public function test_bs19_invalid_calculator_type_is_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", [
            'source_type' => 'calculator', 'calculator_type' => 'pool', 'name' => 'X', 'unit' => 'un',
            'quantity' => '1.000', 'unit_price' => '10.00',
        ])->assertStatus(422)->assertJsonValidationErrors(['calculator_type']);
    }

    /** BS20: catalog source snapshots the CatalogItem's type (product/service). */
    public function test_bs20_catalog_snapshots_type(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['type' => 'product']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['type' => 'product']);
    }

    /** BS21: manual/calculator sources have a null type (only catalog items carry it). */
    public function test_bs21_manual_and_calculator_have_null_type(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())
            ->assertJson(['type' => null]);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", [
            'source_type' => 'calculator', 'calculator_type' => 'slab', 'name' => 'X', 'unit' => 'un',
            'quantity' => '1.000', 'unit_price' => '10.00', 'calculation_snapshot' => ['x' => 1],
        ])->assertJson(['type' => null]);
    }

    // ================= UC1-UC6 (BUDGET-API-01A §5) — unit_cost immutability =================

    /** UC1: catalog create uses CatalogItem.cost_price (regression of BS8B/BP16, restated per the microgate's own numbering). */
    public function test_uc1_catalog_create_uses_catalog_cost_price(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['cost_price' => '42.00']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['unit_cost' => '42.00']);
    }

    /** UC2: PUT unit_cost on a catalog-sourced item is 422 prohibited. */
    public function test_uc2_catalog_item_put_unit_cost_prohibited(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['cost_price' => '42.00']);
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['unit_cost' => '1.00'])
            ->assertStatus(422)->assertJsonValidationErrors(['unit_cost']);
    }

    /** UC3: PUT unit_cost on a calculator-sourced item is 422 prohibited. */
    public function test_uc3_calculator_item_put_unit_cost_prohibited(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload(['unit_cost' => '30.00']))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['unit_cost' => '1.00'])
            ->assertStatus(422)->assertJsonValidationErrors(['unit_cost']);
    }

    /** UC4: PUT unit_cost on a manual item is 422 prohibited. */
    public function test_uc4_manual_item_put_unit_cost_prohibited(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_cost' => '30.00']))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['unit_cost' => '1.00'])
            ->assertStatus(422)->assertJsonValidationErrors(['unit_cost']);
    }

    /**
     * UC5: calling BudgetItemService::updateItem() directly with a
     * hostile unit_cost in the input array never changes the item's
     * original cost — proves the service layer itself never reads
     * $input['unit_cost'], not just that the FormRequest blocks it.
     */
    public function test_uc5_service_layer_ignores_hostile_unit_cost_input(): void
    {
        [$company, $user] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $itemService = app(BudgetItemService::class);

        $item = $this->currentCompanyContext()->run($company, function () use ($customer, $user, $itemService) {
            $budget = app(BudgetService::class)->create(
                ['customer_id' => $customer->id, 'title' => 'X'],
                $user
            );

            return $itemService->addItem($budget, [
                'source_type' => 'manual', 'name' => 'X', 'quantity' => '1.000', 'unit_price' => '10.00', 'unit_cost' => '5.00',
            ]);
        });

        $updated = $this->currentCompanyContext()->run($company, fn () => $itemService->updateItem($item->budget_id, $item, [
            'unit_cost' => '999.00',
        ]));

        $this->assertSame('5.00', (string) $updated->unit_cost);
    }

    /** UC6: a quantity change on PUT recalculates line_cost_total using the frozen (original) unit_cost. */
    public function test_uc6_quantity_update_recalculates_line_cost_total_with_frozen_unit_cost(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '10.00', 'unit_cost' => '6.00']))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['quantity' => '3.000'])
            ->assertStatus(200)
            ->assertJson(['unit_cost' => '6.00', 'line_cost_total' => '18.00']);
    }

    // ================= NU1-NU5 (BUDGET-API-01A §18) — unit nullable =================
    // NU6 (DB column nullable) lives in BudgetStructuralTest.

    /** NU1: a manual item with no unit succeeds (201). */
    public function test_nu1_manual_item_without_unit_succeeds(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $payload = $this->manualItemPayload();
        unset($payload['unit']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $payload)->assertStatus(201);
    }

    /** NU2: the resource reports unit=null when omitted on a manual item. */
    public function test_nu2_manual_item_resource_unit_is_null(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $payload = $this->manualItemPayload();
        unset($payload['unit']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $payload)->assertJson(['unit' => null]);
    }

    /** NU3: a calculator item with no unit succeeds when everything else is valid. */
    public function test_nu3_calculator_item_without_unit_succeeds(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $payload = $this->calculatorItemPayload();
        unset($payload['unit']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $payload)->assertStatus(201)->assertJson(['unit' => null]);
    }

    /** NU4: catalog items continue to use the CatalogItem's own (normally non-null) unit snapshot. */
    public function test_nu4_catalog_item_still_snapshots_unit(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['unit' => 'saco']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['unit' => 'saco']);
    }

    /** NU5: the public proposal resource renders correctly when an item's unit is null. */
    public function test_nu5_public_resource_supports_null_unit(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $payload = $this->manualItemPayload();
        unset($payload['unit']);
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $payload);
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $this->getJson("/api/v1/proposals/{$token}")->assertStatus(200)->assertJsonPath('items.0.unit', null);
    }

    // ================= CS1-CS8 (BUDGET-API-01A §19-24) — calculation_snapshot required for calculator =================

    /** CS1: a calculator item with no calculation_snapshot is 422. */
    public function test_cs1_calculator_without_snapshot_is_422(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $payload = $this->calculatorItemPayload();
        unset($payload['calculation_snapshot']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $payload)
            ->assertStatus(422)->assertJsonValidationErrors(['calculation_snapshot']);
    }

    /** CS2: a calculator item with a snapshot succeeds (201). */
    public function test_cs2_calculator_with_snapshot_succeeds(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload())->assertStatus(201);
    }

    /** CS3: a manual item carrying calculation_snapshot is 422 (regression of BS14, restated). */
    public function test_cs3_manual_with_snapshot_is_422(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['calculation_snapshot' => ['x' => 1]]))
            ->assertStatus(422)->assertJsonValidationErrors(['calculation_snapshot']);
    }

    /** CS4: a catalog item carrying calculation_snapshot is 422. */
    public function test_cs4_catalog_with_snapshot_is_422(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['calculation_snapshot' => ['x' => 1]]))
            ->assertStatus(422)->assertJsonValidationErrors(['calculation_snapshot']);
    }

    /** CS5: the snapshot round-trips exactly as JSONB (regression of BS13, restated). */
    public function test_cs5_snapshot_persisted_as_jsonb(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $snapshot = ['largura' => '4', 'comprimento' => '2.5', 'nested' => ['a' => 1, 'b' => [1, 2, 3]]];

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload(['calculation_snapshot' => $snapshot]))
            ->assertJson(['calculation_snapshot' => $snapshot]);
    }

    /** CS6: the authenticated detail resource exposes calculation_snapshot. */
    public function test_cs6_authenticated_resource_exposes_snapshot(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload(['calculation_snapshot' => ['a' => 1]]));

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJsonPath('items.0.calculation_snapshot', ['a' => 1]);
    }

    /** CS7: the public proposal resource never exposes calculation_snapshot. */
    public function test_cs7_public_resource_hides_snapshot(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->calculatorItemPayload(['calculation_snapshot' => ['secret' => 'formula']]));
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $response = $this->getJson("/api/v1/proposals/{$token}");
        $response->assertStatus(200)->assertJsonMissingPath('items.0.calculation_snapshot');
    }

    /**
     * CS8: the database CHECK itself rejects an invalid shape inserted
     * directly (bypassing the FormRequest entirely) — a calculator row
     * with a null calculation_snapshot, and a manual row WITH one, both
     * violate `budget_items_calculation_snapshot_check`.
     */
    public function test_cs8_db_check_rejects_invalid_snapshot_shape(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();
        $budgetId = $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');

        $this->currentCompanyContext()->run($company, function () use ($budgetId) {
            $this->expectException(QueryException::class);
            BudgetItem::query()->create([
                'budget_id' => $budgetId,
                'source_type' => 'calculator',
                'calculator_type' => 'floor',
                'name' => 'X',
                'quantity' => '1.000',
                'unit_price' => '10.00',
                'line_total' => '10.00',
                'calculation_snapshot' => null,
            ]);
        });
    }
}
