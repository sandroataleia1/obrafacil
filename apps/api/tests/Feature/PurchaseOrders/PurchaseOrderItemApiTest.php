<?php

namespace Tests\Feature\PurchaseOrders;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §75, PI1-PI20.
 */
class PurchaseOrderItemApiTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    private function itemsEndpoint(string $orderId, ?string $itemId = null): string
    {
        $base = self::ORDERS."/{$orderId}/items";

        return $itemId === null ? $base : "{$base}/{$itemId}";
    }

    private function createDraftOrder(): array
    {
        return $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
    }

    /** PI1: add item to a draft Order. */
    public function test_pi1_add_item_to_draft(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload());

        $response->assertCreated()->assertJsonPath('description', 'Cimento CP-II 50kg Votoran');
    }

    /** PI2: unit_code/unit_custom_label are snapshotted server-side from the Material. */
    public function test_pi2_unit_snapshot_server_side(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'other', 'unit_custom_label' => 'bobina']);

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $material->id, 'unit_code' => 'kg', 'unit_custom_label' => 'saco',
        ]))->assertStatus(422)->assertJsonValidationErrors(['unit_code', 'unit_custom_label']);

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $material->id,
        ]));

        $response->assertCreated()
            ->assertJsonPath('unit_code', 'other')
            ->assertJsonPath('unit_custom_label', 'bobina');
    }

    /** PI3: description is its own commercial snapshot. */
    public function test_pi3_description_snapshot(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'description' => 'Especificação comercial customizada',
        ]));

        $response->assertCreated()->assertJsonPath('description', 'Especificação comercial customizada');
    }

    /** PI4: Material must be active to be added. */
    public function test_pi4_material_active_required(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $inactiveMaterial = $this->makeMaterialForCompany($company, ['active' => false]);

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['material_id' => $inactiveMaterial->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material_id');
    }

    /** PI5: duplicate Material in the same Order is 422. */
    public function test_pi5_duplicate_material_is_422(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $material = $this->makeMaterialForCompany($company);

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['material_id' => $material->id]))
            ->assertCreated();

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['material_id' => $material->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('material_id');
    }

    /** PI6: quantity must be > 0, returned as a canonical decimal string. */
    public function test_pi6_quantity_positive_decimal_string(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['quantity' => '0']))
            ->assertStatus(422)->assertJsonValidationErrors('quantity');

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['quantity' => '5']));
        $response->assertCreated()->assertJsonPath('quantity', '5.000');
        $this->assertIsString($response->json('quantity'));
    }

    /** PI7: unit_price >= 0 is allowed while draft. */
    public function test_pi7_unit_price_zero_allowed_draft(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['unit_price' => '0']))
            ->assertCreated()
            ->assertJsonPath('unit_price', '0.00');
    }

    /** PI8: quantity/unit_price come back as canonical decimal strings, never PHP floats. */
    public function test_pi8_canonical_quantity_and_price(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'quantity' => '1.2', 'unit_price' => '15.9',
        ]));

        $response->assertCreated()->assertJsonPath('quantity', '1.200')->assertJsonPath('unit_price', '15.90');
    }

    /** PI9: line_total is exact (quantity x unit_price, rounded to 2dp). */
    public function test_pi9_line_total_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();

        $response = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'quantity' => '3.333', 'unit_price' => '10.00',
        ]));

        $response->assertCreated()->assertJsonPath('line_total', '33.33');
    }

    /** PI10: order total is exact (SUM of already-rounded line totals). */
    public function test_pi10_order_total_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $materialA = $this->makeMaterialForCompany($company);
        $materialB = $this->makeMaterialForCompany($company);

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $materialA->id, 'quantity' => '2', 'unit_price' => '10.005',
        ]))->assertStatus(422); // unit_price max 2 decimals rejected

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $materialA->id, 'quantity' => '2', 'unit_price' => '10.00',
        ]))->assertCreated();
        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $materialB->id, 'quantity' => '3', 'unit_price' => '5.50',
        ]))->assertCreated();

        $detail = $this->getJson(self::ORDERS."/{$order['id']}")->assertOk();
        $detail->assertJsonPath('total', '36.50');
    }

    /** PI11: update description/quantity/unit_price. */
    public function test_pi11_update_description_quantity_price(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();

        $response = $this->putJson($this->itemsEndpoint($order['id'], $item['id']), [
            'description' => 'Descrição atualizada',
            'quantity' => '20.000',
            'unit_price' => '30.00',
            'updated_at' => $item['updated_at'],
        ]);

        $response->assertOk()
            ->assertJsonPath('description', 'Descrição atualizada')
            ->assertJsonPath('quantity', '20.000')
            ->assertJsonPath('unit_price', '30.00');
    }

    /** PI12: material_id is immutable on update. */
    public function test_pi12_material_id_immutable(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();
        $otherMaterial = $this->makeMaterialForCompany($company);

        $this->putJson($this->itemsEndpoint($order['id'], $item['id']), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00',
            'material_id' => $otherMaterial->id,
            'updated_at' => $item['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('material_id');
    }

    /** PI13: unit snapshot is immutable on update. */
    public function test_pi13_unit_snapshot_immutable(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();

        $this->putJson($this->itemsEndpoint($order['id'], $item['id']), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00',
            'unit_code' => 'kg', 'unit_custom_label' => 'saco',
            'updated_at' => $item['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors(['unit_code', 'unit_custom_label']);
    }

    /** PI14: cancelled blocks add/update/delete of items. */
    public function test_pi14_cancelled_blocks_item_mutation(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();
        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $item['updated_at']])->json();

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload(['material_id' => $this->makeMaterialForCompany($company)->id]))
            ->assertStatus(409);

        $this->putJson($this->itemsEndpoint($order['id'], $item['id']), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $item['updated_at'],
        ])->assertStatus(409);

        $this->deleteJson($this->itemsEndpoint($order['id'], $item['id']))->assertStatus(409);
    }

    /** PI15: ordered requires item price > 0 on update. */
    public function test_pi15_ordered_item_price_must_be_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();
        $ordered = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $item['updated_at']])->json();
        $freshItem = collect($ordered['items'])->first();

        $this->putJson($this->itemsEndpoint($order['id'], $freshItem['id']), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '0.00', 'updated_at' => $freshItem['updated_at'],
        ])->assertStatus(422)->assertJsonValidationErrors('unit_price');
    }

    /** PI16: ordered can add an item with a positive price. */
    public function test_pi16_ordered_can_add_item_with_positive_price(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();
        $ordered = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $item['updated_at']])->json();

        $newMaterial = $this->makeMaterialForCompany($company);

        $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload([
            'material_id' => $newMaterial->id, 'unit_price' => '9.99',
        ]))->assertCreated();
    }

    /** PI17: ordered cannot remove the last item. */
    public function test_pi17_ordered_cannot_remove_last_item(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();
        $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $item['updated_at']])->json();

        $this->deleteJson($this->itemsEndpoint($order['id'], $item['id']))->assertStatus(409);

        $this->assertDatabaseHas('purchase_order_items', ['id' => $item['id']]);
    }

    /** PI18: draft can remove the last item. */
    public function test_pi18_draft_can_remove_last_item(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrder();
        $item = $this->postJson($this->itemsEndpoint($order['id']), $this->validPurchaseOrderItemPayload())->json();

        $this->deleteJson($this->itemsEndpoint($order['id'], $item['id']))->assertNoContent();

        $this->assertDatabaseMissing('purchase_order_items', ['id' => $item['id']]);
    }

    /** PI19: an item id belonging to a DIFFERENT Order (same tenant) is 404 on the nested route. */
    public function test_pi19_wrong_order_nested_item_is_404(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $orderA = $this->createDraftOrder();
        $orderB = $this->createDraftOrder();
        $itemA = $this->postJson($this->itemsEndpoint($orderA['id']), $this->validPurchaseOrderItemPayload())->json();

        $this->putJson($this->itemsEndpoint($orderB['id'], $itemA['id']), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $itemA['updated_at'],
        ])->assertStatus(404);

        $this->deleteJson($this->itemsEndpoint($orderB['id'], $itemA['id']))->assertStatus(404);
    }

    /** PI20: an item id belonging to a DIFFERENT tenant is invisible (404). */
    public function test_pi20_cross_tenant_item_invisible(): void
    {
        [$companyA] = $this->makeCompanyWithMember();
        $orderA = $this->makePurchaseOrderForCompany($companyA);
        $itemA = $this->makeItemForPurchaseOrder($companyA, $orderA);

        $this->actingAsNewCompanyMember();
        $orderB = $this->createDraftOrder();

        $this->putJson($this->itemsEndpoint($orderB['id'], $itemA->id), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $itemA->updated_at->toJSON(),
        ])->assertStatus(404);

        $this->putJson($this->itemsEndpoint($orderA->id, $itemA->id), [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $itemA->updated_at->toJSON(),
        ])->assertStatus(404);
    }
}
