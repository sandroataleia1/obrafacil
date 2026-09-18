<?php

namespace Tests\Feature\PurchaseOrders;

use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §76, PS1-PS14.
 */
class PurchaseOrderStatusApiTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    private function createDraftOrderWithItem(): array
    {
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();

        return $this->getJson(self::ORDERS."/{$order['id']}")->json();
    }

    /** PS1: draft -> ordered is valid. */
    public function test_ps1_draft_to_ordered_valid(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrderWithItem();

        $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'ordered');
    }

    /** PS2: confirm with zero items is blocked. */
    public function test_ps2_confirm_with_zero_items_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();

        $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])
            ->assertStatus(422)->assertJsonValidationErrors('items');
    }

    /** PS3: confirm with a zero-price item is blocked. */
    public function test_ps3_confirm_with_zero_price_item_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['unit_price' => '0']))->assertCreated();
        $fresh = $this->getJson(self::ORDERS."/{$order['id']}")->json();

        $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])
            ->assertStatus(422)->assertJsonValidationErrors('items');
    }

    /** PS4: draft -> cancelled. */
    public function test_ps4_draft_to_cancelled(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();

        $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'cancelled');
    }

    /** PS5: ordered -> cancelled. */
    public function test_ps5_ordered_to_cancelled(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrderWithItem();
        $ordered = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])->json();

        $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $ordered['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'cancelled');
    }

    /** PS6: ordered -> draft. */
    public function test_ps6_ordered_to_draft(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrderWithItem();
        $ordered = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])->json();

        $this->postJson(self::ORDERS."/{$order['id']}/return-to-draft", ['updated_at' => $ordered['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'draft');
    }

    /** PS7: cancelled -> draft. */
    public function test_ps7_cancelled_to_draft(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->postJson(self::ORDERS."/{$order['id']}/return-to-draft", ['updated_at' => $cancelled['updated_at']])
            ->assertOk()->assertJsonPath('commercial_status', 'draft');
    }

    /** PS8: cancelled -> ordered directly (confirm) is blocked. */
    public function test_ps8_cancelled_to_ordered_direct_blocked(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $cancelled['updated_at']])
            ->assertStatus(409);
    }

    /** PS9: cancelled header is read-only (covered structurally in PO18, re-asserted here for the status suite). */
    public function test_ps9_cancelled_header_read_only(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $this->putJson(self::ORDERS."/{$order['id']}", [
            'supplier_id' => $cancelled['supplier']['id'],
            'project_id' => $cancelled['project']['id'],
            'order_date' => $cancelled['order_date'],
            'notes' => 'x',
            'updated_at' => $cancelled['updated_at'],
        ])->assertStatus(422);
    }

    /** PS10: cancelled items are read-only. */
    public function test_ps10_cancelled_items_read_only(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrderWithItem();
        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();
        $item = collect($cancelled['items'])->first();

        $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertStatus(409);
        $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $item['updated_at'],
        ])->assertStatus(409);
        $this->deleteJson(self::ORDERS."/{$order['id']}/items/{$item['id']}")->assertStatus(409);
    }

    /** PS11: the ordered invariant (>=1 item, all prices >0) holds continuously, not only at confirm time. */
    public function test_ps11_ordered_invariant_remains_after_item_mutations(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->createDraftOrderWithItem();
        $ordered = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $order['updated_at']])->json();
        $item = collect($ordered['items'])->first();

        // Cannot set price to zero on an existing item while ordered.
        $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '0.00', 'updated_at' => $item['updated_at'],
        ])->assertStatus(422);

        // Cannot delete down to zero items while ordered.
        $this->deleteJson(self::ORDERS."/{$order['id']}/items/{$item['id']}")->assertStatus(409);
    }

    /**
     * PS12: a status action with a stale updated_at is 409. The
     * `updated_at` column is whole-second precision (like Project's own),
     * so a genuinely-prior real value captured moments earlier in the
     * same test can coincide with the row's current value if both land
     * in the same wall-clock second — the precondition here is
     * deliberately offset by a full minute into the past to guarantee
     * staleness regardless of execution speed, mirroring
     * ProjectConcurrencyTest's PCON2.
     */
    public function test_ps12_action_stale_updated_at_409(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $staleUpdatedAt = Carbon::parse($order['updated_at'])->subMinute()->toJSON();

        $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $staleUpdatedAt])
            ->assertStatus(409);
    }

    /** PS13: the header PUT with a stale updated_at is 409 (same offset technique as PS12). */
    public function test_ps13_header_stale_updated_at_409(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $staleUpdatedAt = Carbon::parse($order['updated_at'])->subMinute()->toJSON();

        $this->putJson(self::ORDERS."/{$order['id']}", array_merge($this->headerFromOrder($order), [
            'updated_at' => $staleUpdatedAt, 'notes' => 'não deveria aplicar',
        ]))->assertStatus(409);
    }

    /**
     * PS14: a successful status action's returned updated_at never
     * regresses — >= the original, matching ProjectConcurrencyTest's
     * PCON6 (same whole-second precision reasoning: two operations inside
     * the same test can legitimately land in the same second).
     */
    public function test_ps14_successful_status_advances_updated_at(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();

        $cancelled = $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $original = Carbon::parse($order['updated_at']);
        $new = Carbon::parse($cancelled['updated_at']);
        $this->assertTrue($new->greaterThanOrEqualTo($original));
    }

    /**
     * @return array<string, mixed>
     */
    private function headerFromOrder(array $order): array
    {
        return [
            'supplier_id' => $order['supplier']['id'],
            'project_id' => $order['project']['id'],
            'order_date' => $order['order_date'],
            'updated_at' => $order['updated_at'],
        ];
    }
}
