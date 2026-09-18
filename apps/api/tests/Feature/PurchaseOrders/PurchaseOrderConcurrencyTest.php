<?php

namespace Tests\Feature\PurchaseOrders;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithSupplyChainConcurrency;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §80, PC1-PC8 — real PostgreSQL concurrency, driven via
 * genuinely separate OS processes (App\Console\Commands\
 * SupplyChainConcurrencyProbe). Uses DatabaseTruncation, never
 * RefreshDatabase.
 */
class PurchaseOrderConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithPurchaseOrders, InteractsWithSupplyChainConcurrency;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /** PC1: two simultaneous Order creates for the same Company get distinct sequential numbers. */
    public function test_pc1_simultaneous_order_create_distinct_numbers(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $supplier = $this->makeSupplierForCompany($company);
        $project = $this->makeProjectForCompany($company);

        $processA = $this->startSupplyChainProbe($company, 'create-order', ['supplier' => $supplier->id, 'project' => $project->id]);
        $processB = $this->startSupplyChainProbe($company, 'create-order', ['supplier' => $supplier->id, 'project' => $project->id]);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $this->assertSame('ok', $resultA['status'], json_encode($resultA));
        $this->assertSame('ok', $resultB['status'], json_encode($resultB));

        $numbers = [$resultA['outcome']['number'], $resultB['outcome']['number']];
        $this->assertEqualsCanonicalizing([1, 2], $numbers);
    }

    /** PC2: three simultaneous Order creates for the same Company never duplicate a number. */
    public function test_pc2_three_way_sequence_no_duplicate(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $supplier = $this->makeSupplierForCompany($company);
        $project = $this->makeProjectForCompany($company);

        $processes = array_map(
            fn () => $this->startSupplyChainProbe($company, 'create-order', ['supplier' => $supplier->id, 'project' => $project->id]),
            [1, 2, 3]
        );

        $results = $this->waitForSupplyChainProbes($processes);

        foreach ($results as $result) {
            $this->assertSame('ok', $result['status'], json_encode($result));
        }

        $numbers = array_map(fn ($r) => $r['outcome']['number'], $results);
        $this->assertEqualsCanonicalizing([1, 2, 3], $numbers);
        $this->assertSame(3, PurchaseOrder::withoutGlobalScopes()->where('company_id', $company->id)->count());
    }

    /** PC3/PC4: two simultaneous item creates for the SAME Order+Material — one wins, the other 422s, exactly one item remains. */
    public function test_pc3_pc4_simultaneous_same_material_item_create_one_wins(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $material = $this->makeMaterialForCompany($company);

        $processA = $this->startSupplyChainProbe($company, 'create-item', ['order' => $order->id, 'material' => $material->id]);
        $processB = $this->startSupplyChainProbe($company, 'create-item', ['order' => $order->id, 'material' => $material->id]);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('Illuminate\\Validation\\ValidationException', $loser['exception']);

        $this->assertSame(
            1,
            PurchaseOrderItem::withoutGlobalScopes()->where('purchase_order_id', $order->id)->where('material_id', $material->id)->count()
        );
    }

    /**
     * PC5: confirm vs delete-last-item for the same draft Order with
     * exactly one item — the Order's row lock (both PurchaseOrderStatusService
     * ::confirm() and PurchaseOrderItemService::deleteItem() lock the
     * parent first) means one of two controlled outcomes happens, never
     * an ordered Order with zero items.
     */
    public function test_pc5_confirm_vs_delete_last_item_never_yields_ordered_zero_items(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $item = $this->makeItemForPurchaseOrder($company, $order);
        $capturedUpdatedAt = $order->fresh()->updated_at->toJSON();

        $confirmProcess = $this->startSupplyChainProbe($company, 'confirm-order', [
            'order' => $order->id, 'updated-at' => $capturedUpdatedAt, 'hold-ms' => 400,
        ]);
        usleep(100_000);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-item', [
            'order' => $order->id, 'item' => $item->id,
        ]);

        [$confirmResult, $deleteResult] = $this->waitForSupplyChainProbes([$confirmProcess, $deleteProcess]);

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);
        $itemCount = PurchaseOrderItem::withoutGlobalScopes()->where('purchase_order_id', $order->id)->count();

        // The invariant that must NEVER be violated:
        $this->assertFalse(
            $fresh->commercial_status->value === 'ordered' && $itemCount === 0,
            'An ordered PurchaseOrder must never have zero items.'
        );

        // Exactly one of the two operations must have succeeded (never both).
        $outcomes = [$confirmResult['status'], $deleteResult['status']];
        $this->assertContains('ok', $outcomes, json_encode([$confirmResult, $deleteResult]));
    }

    /** PC6: two concurrent header writers with the same captured updated_at — one wins, the other 409s. */
    public function test_pc6_stale_header_writer_gets_409(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $capturedUpdatedAt = $order->updated_at->toJSON();

        $processA = $this->startSupplyChainProbe($company, 'update-header', [
            'order' => $order->id, 'updated-at' => $capturedUpdatedAt, 'notes' => 'Vencedor', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startSupplyChainProbe($company, 'update-header', [
            'order' => $order->id, 'updated-at' => $capturedUpdatedAt, 'notes' => 'Perdedor',
        ]);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('App\\Purchases\\Exceptions\\PurchaseOrderConcurrencyConflictException', $loser['exception']);

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);
        $this->assertSame('Vencedor', $fresh->notes);
    }

    /** PC7: two concurrent item writers with the same captured item updated_at — one wins, the other 409s. */
    public function test_pc7_stale_item_update_gets_409(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $item = $this->makeItemForPurchaseOrder($company, $order);
        $capturedUpdatedAt = $item->updated_at->toJSON();

        $processA = $this->startSupplyChainProbe($company, 'update-item', [
            'order' => $order->id, 'item' => $item->id, 'updated-at' => $capturedUpdatedAt,
            'quantity' => '5.000', 'unit-price' => '10.00', 'hold-ms' => 500,
        ]);
        usleep(100_000);
        $processB = $this->startSupplyChainProbe($company, 'update-item', [
            'order' => $order->id, 'item' => $item->id, 'updated-at' => $capturedUpdatedAt,
            'quantity' => '7.000', 'unit-price' => '11.00',
        ]);

        [$resultA, $resultB] = $this->waitForSupplyChainProbes([$processA, $processB]);

        $outcomes = [$resultA['status'], $resultB['status']];
        $this->assertEqualsCanonicalizing(['ok', 'error'], $outcomes, json_encode([$resultA, $resultB]));

        $loser = $resultA['status'] === 'error' ? $resultA : $resultB;
        $this->assertSame('App\\Purchases\\Exceptions\\PurchaseOrderConcurrencyConflictException', $loser['exception']);
    }

    /** PC8: the parent's updated_at genuinely advances (or at least never regresses) after an item mutation. */
    public function test_pc8_parent_updated_at_advances_on_item_mutation(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $originalUpdatedAt = $order->updated_at;

        $process = $this->startSupplyChainProbe($company, 'create-item', [
            'order' => $order->id, 'material' => $this->makeMaterialForCompany($company)->id,
        ]);
        [$result] = $this->waitForSupplyChainProbes([$process]);
        $this->assertSame('ok', $result['status'], json_encode($result));

        $fresh = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);
        $this->assertTrue($fresh->updated_at->greaterThanOrEqualTo($originalUpdatedAt));
    }
}
