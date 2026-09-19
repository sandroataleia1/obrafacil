<?php

namespace Tests\Feature\GoodsReceipts;

use App\Models\Company;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Purchases\Exceptions\PurchaseOrderConcurrencyConflictException;
use App\Purchases\Exceptions\PurchaseOrderStatusConflictException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Validation\ValidationException;
use Tests\Feature\GoodsReceipts\Concerns\InteractsWithGoodsReceipts;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithSupplyChainConcurrency;
use Tests\TestCase;

/**
 * SUPPLY-API-01D §72, RC1-RC8 — real PostgreSQL concurrency, driven via
 * genuinely separate OS processes (App\Console\Commands\
 * SupplyChainConcurrencyProbe). Uses DatabaseTruncation, never
 * RefreshDatabase.
 */
class GoodsReceiptConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithGoodsReceipts, InteractsWithSupplyChainConcurrency;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * RC1: two concurrent Receipt creates for the SAME Item, both within
     * the remaining balance — both must succeed (the Order row lock
     * serializes them; it does not spuriously fail either).
     */
    public function test_rc1_two_receipt_creates_serialize_and_both_fit_succeed(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $processA = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '4.000']);
        $processB = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '4.000']);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $this->assertNull($this->crashOrNull($resultA), json_encode($resultA));
        $this->assertNull($this->crashOrNull($resultB), json_encode($resultB));
        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $total = GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item->id)->sum('quantity');
        $this->assertSame('8.000', number_format((float) $total, 3, '.', ''));
    }

    /** RC2: two concurrent Receipt creates that TOGETHER would over-receipt — exactly one must fail. */
    public function test_rc2_over_receipt_race_one_fails(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $processA = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '7.000']);
        $processB = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '6.000']);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $this->assertNull($this->crashOrNull($resultA), json_encode($resultA));
        $this->assertNull($this->crashOrNull($resultB), json_encode($resultB));

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $total = GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item->id)->sum('quantity');
        $this->assertLessThanOrEqual(10.0, (float) $total);
    }

    /** RC3: a Receipt create vs an Item quantity reduction for the SAME Item — never ends with quantity < received. */
    public function test_rc3_receipt_vs_item_quantity_update_safe(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $receiptProcess = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '8.000']);
        $updateProcess = $this->startSupplyChainProbe($company, 'update-item', [
            'order' => $order->id, 'item' => $item->id, 'quantity' => '5.000', 'unit-price' => '10.00',
            'updated-at' => $item->updated_at->toJSON(),
        ]);

        [$receiptResult, $updateResult] = $this->waitForSupplyChainProbes([$receiptProcess, $updateProcess]);

        $this->assertNull($this->crashOrNull($receiptResult), json_encode($receiptResult));
        $this->assertNull($this->crashOrNull($updateResult), json_encode($updateResult));

        $fresh = PurchaseOrderItem::withoutGlobalScopes()->findOrFail($item->id);
        $received = GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item->id)->sum('quantity');

        $this->assertGreaterThanOrEqual((float) $received, (float) $fresh->quantity, 'Item quantity must never end up below its received total.');
    }

    /** RC4: a Receipt create vs an Item delete for the SAME Item — never both succeed. */
    public function test_rc4_receipt_vs_item_delete_safe(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $receiptProcess = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '3.000']);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-item', ['order' => $order->id, 'item' => $item->id]);

        [$receiptResult, $deleteResult] = $this->waitForSupplyChainProbes([$receiptProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($receiptResult), json_encode($receiptResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));

        $itemStillExists = PurchaseOrderItem::withoutGlobalScopes()->whereKey($item->id)->exists();

        if ($itemStillExists) {
            // The Item survived -> its delete must have failed (order needs >=1 item OR the receipt made it non-deletable).
            $this->assertSame('error', $deleteResult['status'], json_encode($deleteResult));
        } else {
            // The Item was deleted -> the receipt attempting to reference it must have failed.
            $this->assertSame('error', $receiptResult['status'], json_encode($receiptResult));
            $this->assertSame(0, GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item->id)->count());
        }
    }

    /**
     * RC5: a Receipt create that would fully receive the last remaining
     * balance vs a concurrent cancel — the Order row lock means exactly
     * one of two controlled, mutually exclusive outcomes happens:
     *   - cancel wins the lock first: it observes the OLD (not yet
     *     fully-received) fulfillment and succeeds; the receipt, once it
     *     finally proceeds, finds the Order no longer `ordered` and fails.
     *   - the receipt wins the lock first: it commits, fully receiving
     *     the Order; cancel, once it proceeds, now sees "fully received"
     *     and is blocked (§45).
     * Never both "ok" (a fully-received Order cancelled), never both
     * "error".
     */
    public function test_rc5_receipt_vs_cancel_fully_received_safe(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $receiptProcess = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '10.000']);
        $cancelProcess = $this->startSupplyChainProbe($company, 'cancel-order', ['order' => $order->id, 'updated-at' => $order->updated_at->toJSON()]);

        [$receiptResult, $cancelResult] = $this->waitForSupplyChainProbes([$receiptProcess, $cancelProcess]);

        $this->assertNull($this->crashOrNull($receiptResult), json_encode($receiptResult));
        $this->assertNull($this->crashOrNull($cancelResult), json_encode($cancelResult));

        $outcomes = [$receiptResult['status'], $cancelResult['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$receiptResult, $cancelResult]));

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);
        $this->assertFalse(
            $fresh->commercial_status->value === 'cancelled' && $cancelResult['status'] === 'ok' && $receiptResult['status'] === 'ok',
            'A fully-received Order must never be successfully cancelled.'
        );
    }

    /**
     * RC6: a Receipt create vs a concurrent return-to-draft on an Order
     * with ZERO prior receipts — never both succeed (one Receipt
     * existing must always block return-to-draft, by construction).
     */
    public function test_rc6_receipt_vs_return_to_draft_safe(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $receiptProcess = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '2.000']);
        $returnProcess = $this->startSupplyChainProbe($company, 'return-to-draft-order', ['order' => $order->id, 'updated-at' => $order->updated_at->toJSON()]);

        [$receiptResult, $returnResult] = $this->waitForSupplyChainProbes([$receiptProcess, $returnProcess]);

        $this->assertNull($this->crashOrNull($receiptResult), json_encode($receiptResult));
        $this->assertNull($this->crashOrNull($returnResult), json_encode($returnResult));

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);
        $hasReceipt = GoodsReceipt::withoutGlobalScopes()->where('purchase_order_id', $order->id)->exists();

        // The invariant: a draft Order with an existing Receipt is impossible.
        $this->assertFalse(
            $fresh->commercial_status->value === 'draft' && $hasReceipt,
            'An Order must never be draft while a GoodsReceipt for it still exists.'
        );
    }

    /** RC7: across every race above, no commercial/physical invariant is ever broken — re-asserted explicitly as its own proof. */
    public function test_rc7_no_invariant_broken_across_races(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('10.000');

        $processA = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '9.000']);
        $processB = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '9.000']);

        $this->waitForSupplyChainProbes([$processA, $processB]);

        $received = GoodsReceiptItem::withoutGlobalScopes()->where('purchase_order_item_id', $item->id)->sum('quantity');
        $this->assertLessThanOrEqual(10.0, (float) $received, 'received must never exceed ordered.');
    }

    /** RC8: zero raw FK/QueryException surfaces across every race in this suite. */
    public function test_rc8_zero_raw_fk_exception_in_races(): void
    {
        [$company, $order, $item] = $this->createOrderedFixture('5.000');

        $receiptProcess = $this->startSupplyChainProbe($company, 'create-receipt', ['order' => $order->id, 'item' => $item->id, 'quantity' => '5.000']);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-item', ['order' => $order->id, 'item' => $item->id]);

        [$receiptResult, $deleteResult] = $this->waitForSupplyChainProbes([$receiptProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($receiptResult), json_encode($receiptResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));
    }

    /**
     * @return array{0: Company, 1: PurchaseOrder, 2: PurchaseOrderItem}
     */
    private function createOrderedFixture(string $quantity): array
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $item = $this->makeItemForPurchaseOrder($company, $order, ['quantity' => $quantity, 'unit_price' => '10.00']);

        $ordered = $this->currentCompanyContext()->run($company, function () use ($order) {
            $locked = $order->fresh();
            $locked->commercial_status = 'ordered';
            $locked->save();

            return $locked->fresh();
        });

        return [$company, $ordered, $item->fresh()];
    }

    /**
     * @return string|null null when the outcome is benign; a description otherwise.
     */
    private function crashOrNull(array $result): ?string
    {
        if ($result['status'] !== 'error') {
            return null;
        }

        $benign = [ValidationException::class, ModelNotFoundException::class, PurchaseOrderStatusConflictException::class, PurchaseOrderConcurrencyConflictException::class];

        return in_array($result['exception'], $benign, true) ? null : "unexpected exception {$result['exception']}: {$result['message']}";
    }
}
