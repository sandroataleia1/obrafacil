<?php

namespace Tests\Feature\Budgets;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Budgets\Concerns\InteractsWithBudgets;
use Tests\TestCase;

/**
 * BUDGET-API-01 BP1-BP18. Money/margin rules — never float, round-half-up
 * bcmath, nullable cost propagation, negative margin allowed,
 * margin_percentage derived-only.
 */
class BudgetPricingTest extends TestCase
{
    use InteractsWithBudgets, RefreshDatabase;

    private function createDraftBudgetId(): string
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        return $this->postJson('/api/v1/budgets', $this->validBudgetPayload(['customer_id' => $customer->id]))->json('id');
    }

    /** BP1: line_total = quantity * unit_price, rounded to 2dp. */
    public function test_bp1_line_total_is_quantity_times_unit_price(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['quantity' => '2.500', 'unit_price' => '10.333']))
            ->assertJson(['line_total' => '25.83']);
    }

    /** BP2: half-up rounding — 2.345 rounds to 2.35, never 2.34. */
    public function test_bp2_half_up_rounding(): void
    {
        $budgetId = $this->createDraftBudgetId();

        // unit_price is money (already 2dp); the 3rd decimal that needs
        // rounding comes from quantity's own 3dp precision:
        // 1.500 * 8.23 = 12.345 exactly -> half-up rounds to 12.35, never
        // truncated down to 12.34.
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['quantity' => '1.500', 'unit_price' => '8.23']))
            ->assertJson(['line_total' => '12.35']);
    }

    /** BP3: money fields are always decimal strings, never JSON numbers. */
    public function test_bp3_money_fields_are_strings(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $response = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload());

        $this->assertIsString($response->json('unit_price'));
        $this->assertIsString($response->json('line_total'));
        $this->assertIsString($response->json('quantity'));
    }

    /** BP4: sale_subtotal is the SUM of every item's line_total. */
    public function test_bp4_sale_subtotal_sums_all_line_totals(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']));
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00']));

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['sale_subtotal' => '150.00']);
    }

    /** BP5: when every item has unit_cost set, cost_subtotal/margin_amount are computed. */
    public function test_bp5_cost_subtotal_computed_when_all_items_have_cost(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00', 'unit_cost' => '60.00']));

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson([
            'cost_subtotal' => '60.00', 'margin_amount' => '40.00',
        ]);
    }

    /** BP6: ANY item missing unit_cost makes the whole Budget's cost_subtotal NULL — never silently 0. */
    public function test_bp6_any_missing_cost_nulls_cost_subtotal(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00', 'unit_cost' => '60.00']));
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00', 'unit_cost' => null]));

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson([
            'cost_subtotal' => null, 'margin_amount' => null, 'margin_percentage' => null,
        ]);
    }

    /** BP7: margin_amount CAN be negative — selling below cost is valid, never clamped or rejected. */
    public function test_bp7_negative_margin_is_allowed(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00', 'unit_cost' => '80.00']))
            ->assertStatus(201);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['margin_amount' => '-30.00']);
    }

    /** BP8: margin_percentage is derived: margin_amount / cost_subtotal * 100. */
    public function test_bp8_margin_percentage_is_derived(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00', 'unit_cost' => '75.00']));

        // sale_subtotal=100.00, cost_subtotal=75.00, margin_amount=25.00
        // margin_percentage = 25.00 / 75.00 * 100 = 33.3333
        $response = $this->getJson("/api/v1/budgets/{$budgetId}");
        $this->assertSame('33.3333', $response->json('margin_percentage'));
    }

    /** BP9: margin_percentage is never accepted as input on create. */
    public function test_bp9_margin_percentage_prohibited_on_create(): void
    {
        $this->actingAsNewCompanyMember();
        $customer = $this->makeCustomer();

        $this->postJson('/api/v1/budgets', $this->validBudgetPayload([
            'customer_id' => $customer->id, 'margin_percentage' => '99.00',
        ]))->assertStatus(422)->assertJsonValidationErrors(['margin_percentage']);
    }

    /** BP10: margin_percentage is never accepted as input on item create. */
    public function test_bp10_margin_percentage_prohibited_on_item(): void
    {
        $budgetId = $this->createDraftBudgetId();

        // margin_percentage isn't even a recognized item field — sending
        // it must never influence the computed value.
        $response = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload([
            'unit_price' => '100.00', 'unit_cost' => '75.00', 'margin_percentage' => '999.00',
        ]));
        $response->assertStatus(201);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['margin_percentage' => '33.3333']);
    }

    /** BP11: total = sale_subtotal - discount_amount. */
    public function test_bp11_total_is_sale_subtotal_minus_discount(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '200.00']));

        $this->putJson("/api/v1/budgets/{$budgetId}", [
            'customer_id' => $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id'),
            'title' => 'X', 'discount_amount' => '50.00',
        ])->assertJson(['total' => '150.00']);
    }

    /** BP12: discount_amount greater than sale_subtotal is rejected. */
    public function test_bp12_discount_greater_than_sale_subtotal_rejected_on_update(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']));
        $customerId = $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id');

        $this->putJson("/api/v1/budgets/{$budgetId}", [
            'customer_id' => $customerId, 'title' => 'X', 'discount_amount' => '200.00',
        ])->assertStatus(422)->assertJsonValidationErrors(['discount_amount']);
    }

    /** BP13: total is never negative (structurally guaranteed by discount <= sale_subtotal). */
    public function test_bp13_total_never_negative(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']));
        $customerId = $this->getJson("/api/v1/budgets/{$budgetId}")->json('customer_id');

        $this->putJson("/api/v1/budgets/{$budgetId}", [
            'customer_id' => $customerId, 'title' => 'X', 'discount_amount' => '100.00',
        ])->assertStatus(200)->assertJson(['total' => '0.00']);
    }

    /** BP14: zero items -> sale_subtotal/total are 0.00, cost_subtotal is null (no items with null cost, but also nothing to sum meaningfully — treated as computed 0). */
    public function test_bp14_zero_items_gives_zero_totals(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['sale_subtotal' => '0.00', 'total' => '0.00']);
    }

    /** BP15: cost_subtotal recomputed correctly after deleting the item that had a null unit_cost. */
    public function test_bp15_cost_subtotal_recovers_after_deleting_null_cost_item(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00', 'unit_cost' => '60.00']));
        $nullCostItem = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '50.00', 'unit_cost' => null]))->json('id');

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['cost_subtotal' => null]);

        $this->deleteJson("/api/v1/budgets/{$budgetId}/items/{$nullCostItem}")->assertStatus(204);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['cost_subtotal' => '60.00', 'margin_amount' => '40.00']);
    }

    /** BP16: catalog-sourced item with no explicit unit_cost falls back to the CatalogItem's cost_price. */
    public function test_bp16_catalog_item_cost_falls_back_to_catalog_cost_price(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '120.00', 'cost_price' => '70.00']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['unit_cost' => '70.00', 'unit_price' => '120.00']);
    }

    /** BP17: catalog-sourced item with a null CatalogItem cost_price leaves unit_cost null. */
    public function test_bp17_catalog_item_with_null_cost_leaves_unit_cost_null(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '120.00', 'cost_price' => null]);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem))
            ->assertJson(['unit_cost' => null]);
    }

    /** BP18: an explicit unit_price on a catalog item overrides the CatalogItem's sale_price. */
    public function test_bp18_explicit_unit_price_overrides_catalog_sale_price(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $catalogItem = $this->makeCatalogItem(['sale_price' => '120.00']);

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->catalogItemPayload($catalogItem, ['unit_price' => '99.00']))
            ->assertJson(['unit_price' => '99.00']);
    }

    /**
     * BP3 (spec's own numbering — "line discount"): line_total =
     * gross_sale - line_discount, where gross_sale = round(quantity ×
     * unit_price, 2). Mirrors ServiceOrderItem's grossLine()/lineTotal().
     */
    public function test_bp19_line_discount_is_subtracted_from_gross_sale(): void
    {
        $budgetId = $this->createDraftBudgetId();

        // gross_sale = 2.000 * 50.00 = 100.00; line_total = 100.00 - 15.00 = 85.00
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload([
            'quantity' => '2.000', 'unit_price' => '50.00', 'line_discount' => '15.00',
        ]))->assertJson(['line_total' => '85.00']);
    }

    /** BP3b: omitting line_discount defaults it to 0.00 (line_total = gross_sale). */
    public function test_bp20_omitted_line_discount_defaults_to_zero(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']))
            ->assertJson(['line_discount' => '0.00', 'line_total' => '100.00']);
    }

    /** BP3c: a negative line_discount is rejected (422) — never accepted. */
    public function test_bp21_negative_line_discount_is_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();

        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['line_discount' => '-1.00']))
            ->assertStatus(422)->assertJsonValidationErrors(['line_discount']);
    }

    /**
     * BP3d: a line_discount larger than the line's own gross_sale is
     * rejected (422) — mirrors ServiceOrderItemService's
     * assertDiscountWithinGross() rejection of an over-large line
     * discount, rather than silently clamping line_total at zero.
     */
    public function test_bp22_line_discount_greater_than_gross_sale_is_rejected(): void
    {
        $budgetId = $this->createDraftBudgetId();

        // gross_sale = 1.000 * 50.00 = 50.00; discount of 60.00 exceeds it.
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload([
            'unit_price' => '50.00', 'line_discount' => '60.00',
        ]))->assertStatus(422)->assertJsonValidationErrors(['line_discount']);
    }

    /** BP3e: updating an item's line_discount recalculates line_total and the parent sale_subtotal. */
    public function test_bp23_update_line_discount_recalculates_totals(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $itemId = $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload(['unit_price' => '100.00']))->json('id');

        $this->putJson("/api/v1/budgets/{$budgetId}/items/{$itemId}", ['line_discount' => '20.00'])
            ->assertJson(['line_discount' => '20.00', 'line_total' => '80.00']);

        $this->getJson("/api/v1/budgets/{$budgetId}")->assertJson(['sale_subtotal' => '80.00']);
    }

    /** BP3f: the public proposal resource exposes line_discount (spec §29 lists it as public-safe). */
    public function test_bp24_public_proposal_exposes_line_discount(): void
    {
        $budgetId = $this->createDraftBudgetId();
        $this->postJson("/api/v1/budgets/{$budgetId}/items", $this->manualItemPayload([
            'unit_price' => '100.00', 'line_discount' => '10.00',
        ]))->assertStatus(201);
        $token = $this->postJson("/api/v1/budgets/{$budgetId}/submit")->json('proposal_token');

        $this->getJson("/api/v1/proposals/{$token}")->assertJson(['items' => [['line_discount' => '10.00']]]);
    }
}
