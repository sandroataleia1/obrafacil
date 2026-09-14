<?php

namespace Tests\Feature\Budgets;

use App\Models\CatalogItem;
use App\Models\Company;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BS1-BS16. BudgetItemSourceType rules: catalog/
 * calculator/manual.
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

    /** BS10: manual source requires name/unit/quantity/unit_price. */
    public function test_bs10_manual_requires_core_fields(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['source_type' => 'manual', 'quantity' => '1.000'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'unit', 'unit_price']);
    }

    /** BS11: manual source persists with source_type=manual and no catalog_item_id. */
    public function test_bs11_manual_source_persists_correctly(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload())
            ->assertJson(['source_type' => 'manual', 'catalog_item_id' => null]);
    }

    /** BS12: calculator source requires name/unit/quantity/unit_price/calculator_type. */
    public function test_bs12_calculator_requires_core_fields(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", ['source_type' => 'calculator', 'quantity' => '1.000'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'unit', 'unit_price', 'calculator_type']);
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
            'quantity' => '1.000', 'unit_price' => '10.00',
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
            'quantity' => '1.000', 'unit_price' => '10.00',
        ])->assertJson(['type' => null]);
    }
}
