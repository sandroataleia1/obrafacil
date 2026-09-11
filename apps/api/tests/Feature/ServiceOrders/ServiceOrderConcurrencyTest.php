<?php

namespace Tests\Feature\ServiceOrders;

use App\Models\CatalogItem;
use App\Models\Company;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderItemService;
use App\ServiceOrders\ServiceOrderService;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrderConcurrency;
use Tests\Feature\ServiceOrders\Concerns\InteractsWithServiceOrders;
use Tests\TestCase;

/**
 * BACKEND-06B §23-25. CC1-CC12 — real PostgreSQL concurrency, driven via
 * genuinely separate OS processes (see
 * App\Console\Commands\ServiceOrderConcurrencyProbe and
 * InteractsWithServiceOrderConcurrency). Uses DatabaseTruncation, never
 * RefreshDatabase — see that trait's docblock for why.
 */
class ServiceOrderConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithServiceOrderConcurrency, InteractsWithServiceOrders;

    /**
     * DatabaseTruncation truncates BEFORE each test, not after — so the
     * last test's committed rows (this trait never wraps writes in a
     * rolled-back transaction, unlike RefreshDatabase) would otherwise
     * leak into whatever test class runs next in the same suite. Truncate
     * again on the way out so this class always leaves the database
     * exactly as clean as it found it.
     */
    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * @return array{0: Company, 1: ServiceOrder, 2: CatalogItem, 3: CatalogItem}
     */
    private function createOrderFixture(): array
    {
        [$company, $user] = $this->makeCompanyWithMember();

        return $this->currentCompanyContext()->run($company, function () use ($company, $user) {
            $customer = Customer::factory()->create();
            $address = CustomerAddress::factory()->create(['customer_id' => $customer->id]);
            $catalogItemA = CatalogItem::factory()->create(['sale_price' => '100.00']);
            $catalogItemB = CatalogItem::factory()->create(['sale_price' => '200.00']);

            $order = app(ServiceOrderService::class)->create([
                'customer_id' => $customer->id,
                'customer_address_id' => $address->id,
                'title' => 'O.S. de concorrência',
            ], $user);

            return [$company, $order, $catalogItemA, $catalogItemB];
        });
    }

    private function freshOrder(Company $company, string $orderId): ServiceOrder
    {
        return $this->currentCompanyContext()->run($company, fn () => ServiceOrder::query()->findOrFail($orderId));
    }

    /** CC1: two concurrent addItem calls both persist — subtotal sums both. */
    public function test_cc1_two_concurrent_add_items_both_persist(): void
    {
        [$company, $order, $itemA, $itemB] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000', 'hold-ms' => 600,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemB->id, 'quantity' => '1.000',
        ]);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('300.00', (string) $fresh->subtotal);
        $this->assertServiceOrderInvariants($company, $order->id);
    }

    /** CC2: two concurrent addItem calls receive distinct sort_order values. */
    public function test_cc2_two_concurrent_add_items_get_distinct_sort_order(): void
    {
        [$company, $order, $itemA, $itemB] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemB->id, 'quantity' => '1.000',
        ]);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $sortOrderA = $resultA['outcome']['sort_order'];
        $sortOrderB = $resultB['outcome']['sort_order'];

        $this->assertNotSame($sortOrderA, $sortOrderB);
        $this->assertEqualsCanonicalizing([1, 2], [$sortOrderA, $sortOrderB]);
    }

    /** CC3: addItem racing updateHeader(travel_fee) — final totals are coherent. */
    public function test_cc3_add_item_and_update_header_travel_fee_are_coherent(): void
    {
        [$company, $order, $itemA] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000', 'hold-ms' => 600,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'update-header', [
            'travel-fee' => '50.00',
        ]);

        $this->waitForProbes([$processA, $processB]);

        $this->assertServiceOrderInvariants($company, $order->id);
        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('50.00', (string) $fresh->travel_fee);
        $this->assertSame('100.00', (string) $fresh->subtotal);
    }

    /** CC4: updateItem racing updateHeader — final totals are coherent. */
    public function test_cc4_update_item_and_update_header_are_coherent(): void
    {
        [$company, $order, $itemA] = $this->createOrderFixture();
        $itemId = $this->currentCompanyContext()->run(
            $company,
            fn () => app(ServiceOrderItemService::class)
                ->addItem($order, ['catalog_item_id' => $itemA->id, 'quantity' => '1.000'])->id
        );

        $processA = $this->startConcurrencyProbe($company, $order, 'update-item', [
            'item' => $itemId, 'quantity' => '3.000', 'hold-ms' => 600,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'update-header', [
            'travel-fee' => '20.00',
        ]);

        $this->waitForProbes([$processA, $processB]);

        $this->assertServiceOrderInvariants($company, $order->id);
        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('300.00', (string) $fresh->subtotal);
        $this->assertSame('20.00', (string) $fresh->travel_fee);
    }

    /** CC5: deleteItem racing updateHeader — coherent totals, or a clean rollback if the discount would become invalid. */
    public function test_cc5_delete_item_and_update_header_are_coherent(): void
    {
        [$company, $order, $itemA, $itemB] = $this->createOrderFixture();
        $itemService = app(ServiceOrderItemService::class);
        $itemIdToDelete = $this->currentCompanyContext()->run($company, function () use ($order, $itemA, $itemB, $itemService) {
            $itemService->addItem($order, ['catalog_item_id' => $itemA->id, 'quantity' => '1.000']);

            return $itemService->addItem($order, ['catalog_item_id' => $itemB->id, 'quantity' => '1.000'])->id;
        });

        $processA = $this->startConcurrencyProbe($company, $order, 'delete-item', [
            'item' => $itemIdToDelete, 'hold-ms' => 600,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'update-header', [
            'travel-fee' => '15.00',
        ]);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));
        $this->assertServiceOrderInvariants($company, $order->id);

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('100.00', (string) $fresh->subtotal);
    }

    /** CC6: complete vs cancel — exactly one wins, the other gets 409, status is never silently overwritten. */
    public function test_cc6_complete_vs_cancel_exactly_one_wins(): void
    {
        [$company, $order] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'complete', ['hold-ms' => 700]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'cancel');

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes);

        $winner = $resultA['status'] === 'ok' ? $resultA : $resultB;
        $loser = $resultA['status'] === 'ok' ? $resultB : $resultA;

        $this->assertSame('App\\ServiceOrders\\Exceptions\\ServiceOrderStatusConflictException', $loser['exception']);

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertContains($fresh->status->value, ['completed', 'cancelled']);
        $this->assertSame($winner['action'] === 'complete' ? 'completed' : 'cancelled', $fresh->status->value);
    }

    /** CC7: complete vs addItem — if complete wins the lock first, the item is rejected (409), never inserted. */
    public function test_cc7_complete_wins_rejects_concurrent_add_item(): void
    {
        [$company, $order, $itemA] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'complete', ['hold-ms' => 700]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000',
        ]);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('error', $resultB['status'], json_encode($resultB));
        $this->assertSame('App\\ServiceOrders\\Exceptions\\ServiceOrderStatusConflictException', $resultB['exception']);

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('completed', $fresh->status->value);
        $this->assertSame('0.00', (string) $fresh->subtotal);
        $this->assertServiceOrderInvariants($company, $order->id);
    }

    /** CC8: addItem vs complete — if addItem wins the lock first, it lands, and complete's response carries the final totals. */
    public function test_cc8_add_item_wins_then_complete_sees_final_totals(): void
    {
        [$company, $order, $itemA] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000', 'hold-ms' => 700,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'complete');

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('completed', $fresh->status->value);
        $this->assertSame('100.00', (string) $fresh->subtotal);
        $this->assertServiceOrderInvariants($company, $order->id);
    }

    /** CC9: cancel vs updateHeader — the edit never lands once cancel has committed first. */
    public function test_cc9_cancel_wins_rejects_concurrent_header_update(): void
    {
        [$company, $order] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'cancel', ['hold-ms' => 700]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'update-header', ['title' => 'Não deveria salvar']);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('error', $resultB['status'], json_encode($resultB));
        $this->assertSame('App\\ServiceOrders\\Exceptions\\ServiceOrderStatusConflictException', $resultB['exception']);

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('cancelled', $fresh->status->value);
        $this->assertNotSame('Não deveria salvar', $fresh->title);
    }

    /** CC10: complete vs start — in_progress can never happen after completed. */
    public function test_cc10_complete_wins_rejects_concurrent_start(): void
    {
        [$company, $order] = $this->createOrderFixture();

        $processA = $this->startConcurrencyProbe($company, $order, 'complete', ['hold-ms' => 700]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'start');

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('error', $resultB['status'], json_encode($resultB));

        $fresh = $this->freshOrder($company, $order->id);
        $this->assertSame('completed', $fresh->status->value);
        $this->assertNull($fresh->started_at);
    }

    /** CC11: two concurrent financial header updates never produce an inconsistent subtotal/total. */
    public function test_cc11_two_concurrent_financial_updates_stay_consistent(): void
    {
        [$company, $order, $itemA] = $this->createOrderFixture();
        $this->currentCompanyContext()->run(
            $company,
            fn () => app(ServiceOrderItemService::class)
                ->addItem($order, ['catalog_item_id' => $itemA->id, 'quantity' => '1.000'])
        );

        $processA = $this->startConcurrencyProbe($company, $order, 'update-header', [
            'travel-fee' => '30.00', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startConcurrencyProbe($company, $order, 'update-header', [
            'order-discount' => '10.00',
        ]);

        [$resultA, $resultB] = $this->waitForProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $this->assertServiceOrderInvariants($company, $order->id);
    }

    /** CC12: locking is per-O.S. — mutating Order A does not block Order B beyond normal DB behavior. */
    public function test_cc12_lock_is_scoped_per_order_not_global(): void
    {
        [$companyA, $orderA, $itemA] = $this->createOrderFixture();
        [$companyB, $orderB, $itemB] = $this->createOrderFixture();

        $start = microtime(true);

        $processA = $this->startConcurrencyProbe($companyA, $orderA, 'add-item', [
            'catalog-item' => $itemA->id, 'quantity' => '1.000', 'hold-ms' => 1500,
        ]);
        $processB = $this->startConcurrencyProbe($companyB, $orderB, 'add-item', [
            'catalog-item' => $itemB->id, 'quantity' => '1.000',
        ]);

        $resultB = $this->waitForProbe($processB);
        $elapsedUntilBFinished = microtime(true) - $start;
        [$resultA] = $this->waitForProbes([$processA]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        // If B were blocked by A's lock, waiting for B alone would take
        // >= 1.5s (A's hold time). Since the two O.S.s are unrelated
        // rows, B finishes immediately — comfortably under that.
        $this->assertLessThan(1.2, $elapsedUntilBFinished, "Order B should not have waited on Order A's lock");

        $this->assertServiceOrderInvariants($companyA, $orderA->id);
        $this->assertServiceOrderInvariants($companyB, $orderB->id);
    }
}
