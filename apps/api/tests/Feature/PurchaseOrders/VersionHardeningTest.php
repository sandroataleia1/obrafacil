<?php

namespace Tests\Feature\PurchaseOrders;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Purchases\PurchaseOrderVersionClock;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\TestCase;

/**
 * SUPPLY-API-01C1 §25, V1-V12. `updated_at` on PurchaseOrder/
 * PurchaseOrderItem is the optimistic-concurrency VERSION, not just
 * audit — every successful mutation must produce a version strictly
 * greater than the one it started from, even inside the same
 * microsecond/frozen clock (§14/§19). No sleep()/usleep() anywhere in
 * this file (§17).
 */
class VersionHardeningTest extends TestCase
{
    use InteractsWithPurchaseOrders, RefreshDatabase;

    private const string ORDERS = '/api/v1/purchase-orders';

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** V1: the real DB timestamp precision for these two tables is microsecond (6), proven directly against information_schema. */
    public function test_v1_db_timestamp_precision_documented(): void
    {
        $columns = collect(DB::select("
            SELECT table_name, column_name, datetime_precision
            FROM information_schema.columns
            WHERE table_name IN ('purchase_orders', 'purchase_order_items')
            AND column_name IN ('created_at', 'updated_at')
        "));

        $this->assertCount(4, $columns);
        foreach ($columns as $column) {
            $this->assertSame(6, $column->datetime_precision, "{$column->table_name}.{$column->column_name} must be precision 6.");
        }
    }

    /** V2: the PurchaseOrder model persists with microsecond format. */
    public function test_v2_order_model_preserves_precision(): void
    {
        $reflection = new \ReflectionClass(PurchaseOrder::class);
        $property = $reflection->getProperty('dateFormat');
        $property->setAccessible(true);
        $instance = new PurchaseOrder;
        $this->assertSame('Y-m-d H:i:s.u', $property->getValue($instance));
    }

    /** V3: the PurchaseOrderItem model persists with microsecond format. */
    public function test_v3_item_model_preserves_precision(): void
    {
        $reflection = new \ReflectionClass(PurchaseOrderItem::class);
        $property = $reflection->getProperty('dateFormat');
        $property->setAccessible(true);
        $instance = new PurchaseOrderItem;
        $this->assertSame('Y-m-d H:i:s.u', $property->getValue($instance));
    }

    /** V4: a successful header write gives a version strictly greater than the one it started from. */
    public function test_v4_header_write_strictly_advances_version(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $v1 = Carbon::parse($order['updated_at']);

        // A genuine change is required — Eloquent's save() is a complete
        // no-op (never calls updateTimestamps()) when nothing is dirty,
        // so a PUT that resubmits identical values would never advance
        // the version at all (correctly, since nothing actually changed).
        $response = $this->putJson(self::ORDERS."/{$order['id']}", $this->headerFrom($order, ['notes' => 'Alterado']));
        $v2 = Carbon::parse($response->json('updated_at'));

        $this->assertTrue($v2->greaterThan($v1), "V2 ({$v2}) must be strictly greater than V1 ({$v1}).");
    }

    /** V5: reusing the SAME old header version again immediately (no sleep) gets 409 the second time. */
    public function test_v5_same_old_header_version_immediately_gets_409(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $v1 = $order['updated_at'];

        $this->putJson(self::ORDERS."/{$order['id']}", $this->headerFrom($order, ['notes' => 'primeira']))->assertOk();

        $this->putJson(self::ORDERS."/{$order['id']}", $this->headerFrom($order, ['notes' => 'segunda', 'updated_at' => $v1]))
            ->assertStatus(409);
    }

    /** V6: a status write (confirm) strictly advances the version. */
    public function test_v6_status_write_advances_strictly(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $fresh = $this->getJson(self::ORDERS."/{$order['id']}")->json();
        $v1 = Carbon::parse($fresh['updated_at']);

        $confirmed = $this->postJson(self::ORDERS."/{$order['id']}/confirm", ['updated_at' => $fresh['updated_at']])->json();
        $v2 = Carbon::parse($confirmed['updated_at']);

        $this->assertTrue($v2->greaterThan($v1));
    }

    /** V7: a stale status action immediately gets 409. */
    public function test_v7_stale_status_immediately_gets_409(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $v1 = $order['updated_at'];

        $this->putJson(self::ORDERS."/{$order['id']}", $this->headerFrom($order, ['notes' => 'mudou']))->assertOk();

        $this->postJson(self::ORDERS."/{$order['id']}/cancel", ['updated_at' => $v1])->assertStatus(409);
    }

    /** V8: an item write strictly advances the ITEM's own version. */
    public function test_v8_item_write_advances_item_version_strictly(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();
        $v1 = Carbon::parse($item['updated_at']);

        $updated = $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'Atualizado', 'quantity' => '2.000', 'unit_price' => '5.00', 'updated_at' => $item['updated_at'],
        ])->json();
        $v2 = Carbon::parse($updated['updated_at']);

        $this->assertTrue($v2->greaterThan($v1));
    }

    /** V9: reusing the SAME old item version again immediately gets 409. */
    public function test_v9_same_old_item_version_immediately_gets_409(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();
        $v1 = $item['updated_at'];

        $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'Primeira', 'quantity' => '2.000', 'unit_price' => '5.00', 'updated_at' => $v1,
        ])->assertOk();

        $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'Segunda', 'quantity' => '3.000', 'unit_price' => '6.00', 'updated_at' => $v1,
        ])->assertStatus(409);
    }

    /** V10: adding an item strictly advances the PARENT Order's version. */
    public function test_v10_add_item_strictly_advances_parent_version(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $v1 = Carbon::parse($order['updated_at']);

        $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $fresh = $this->getJson(self::ORDERS."/{$order['id']}")->json();
        $v2 = Carbon::parse($fresh['updated_at']);

        $this->assertTrue($v2->greaterThan($v1));
    }

    /** V11: updating and then deleting an item each strictly advance the PARENT Order's version. */
    public function test_v11_update_and_delete_item_each_strictly_advance_parent_version(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $item = $this->postJson(self::ORDERS."/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->json();
        $afterAdd = $this->getJson(self::ORDERS."/{$order['id']}")->json();
        $v2 = Carbon::parse($afterAdd['updated_at']);

        $this->putJson(self::ORDERS."/{$order['id']}/items/{$item['id']}", [
            'description' => 'x', 'quantity' => '1.000', 'unit_price' => '1.00', 'updated_at' => $item['updated_at'],
        ])->assertOk();
        $afterUpdate = $this->getJson(self::ORDERS."/{$order['id']}")->json();
        $v3 = Carbon::parse($afterUpdate['updated_at']);
        $this->assertTrue($v3->greaterThan($v2));

        $this->deleteJson(self::ORDERS."/{$order['id']}/items/{$item['id']}")->assertNoContent();
        $afterDelete = $this->getJson(self::ORDERS."/{$order['id']}")->json();
        $v4 = Carbon::parse($afterDelete['updated_at']);
        $this->assertTrue($v4->greaterThan($v3));
    }

    /**
     * V12: even with the wall clock FROZEN at exactly the current
     * version, a mutation still produces a strictly greater version —
     * proves PurchaseOrderVersionClock is logically monotonic, not
     * merely "usually correct because the clock ticked forward" (§19).
     */
    public function test_v12_frozen_clock_still_yields_monotonic_version(): void
    {
        $this->actingAsNewCompanyMember();
        $order = $this->postJson(self::ORDERS, $this->validPurchaseOrderPayload())->json();
        $v1 = Carbon::parse($order['updated_at']);

        Carbon::setTestNow($v1);

        $response = $this->putJson(self::ORDERS."/{$order['id']}", $this->headerFrom($order, ['notes' => 'Alterado']));
        $v2 = Carbon::parse($response->json('updated_at'));

        Carbon::setTestNow();

        $this->assertTrue($v2->greaterThan($v1), "Even frozen at V1 ({$v1}), the new version ({$v2}) must be strictly greater.");
        $this->assertSame($v1->copy()->addMicrosecond()->toIso8601String(), $v2->toIso8601String());
    }

    /** Direct unit proof of the clock helper itself, independent of any HTTP flow. */
    public function test_version_clock_helper_same_instant_advances_one_microsecond(): void
    {
        $current = Carbon::create(2026, 1, 1, 12, 0, 0, 'UTC');
        Carbon::setTestNow($current);

        $next = PurchaseOrderVersionClock::nextVersion($current);

        Carbon::setTestNow();

        $this->assertTrue($next->greaterThan($current));
        $this->assertEquals(1, $current->diffInMicroseconds($next));
    }

    /**
     * @return array<string, mixed>
     */
    private function headerFrom(array $order, array $overrides = []): array
    {
        return array_merge([
            'supplier_id' => $order['supplier']['id'],
            'project_id' => $order['project']['id'],
            'order_date' => $order['order_date'],
            'updated_at' => $order['updated_at'],
        ], $overrides);
    }
}
