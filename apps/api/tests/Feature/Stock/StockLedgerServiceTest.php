<?php

namespace Tests\Feature\Stock;

use App\Models\Company;
use App\Stock\StockLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §76, LG1-LG16. `$ledger` is called via
 * `currentCompanyContext()->run()` — outside an HTTP request there is no
 * ResolveCurrentCompany middleware to set the active tenant, and
 * GoodsReceiptItem/MaterialConsumption/StockAdjustment all resolve
 * through `CompanyScope`.
 */
class StockLedgerServiceTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /**
     * @return array{total_in: string, total_out: string, balance: string}
     */
    private function totalsFor(Company $company, string $projectId, string $materialId): array
    {
        return $this->currentCompanyContext()->run($company, function () use ($projectId, $materialId) {
            $ledger = app(StockLedgerService::class);

            return $ledger->totals($ledger->events($projectId, $materialId));
        });
    }

    /** LG1: a GoodsReceipt contributes a positive event. */
    public function test_lg1_receipt_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '7.000');

        $this->assertSame('7.000', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG2: a Consumption contributes a negative event. */
    public function test_lg2_consumption_negative(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '3.000']));

        $totals = $this->totalsFor($company, $project->id, $material->id);
        $this->assertSame('3.000', $totals['total_out']);
        $this->assertSame('7.000', $totals['balance']);
    }

    /** LG3: ADJUSTMENT_IN contributes a positive event. */
    public function test_lg3_adjustment_in_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '5.000']));

        $this->assertSame('5.000', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG4: ADJUSTMENT_OUT contributes a negative event. */
    public function test_lg4_adjustment_out_negative(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '10.000']));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_OUT', 'quantity' => '4.000']));

        $this->assertSame('4.000', $this->totalsFor($company, $project->id, $material->id)['total_out']);
    }

    /** LG5: same-day events are aggregated before the cumulative check. */
    public function test_lg5_same_day_aggregation(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $today = now()->toDateString();
        $this->createReceivedStock($project->id, $material->id, '5.000', $today);

        $isValid = $this->currentCompanyContext()->run($company, function () use ($project, $material, $today) {
            return app(StockLedgerService::class)->isValidWithCandidate($project->id, $material->id, $today, '-5.000');
        });

        $this->assertTrue($isValid);
    }

    /** LG6: events are aggregated regardless of insertion order (chronological correctness). */
    public function test_lg6_chronological_order(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '5.000', now()->subDays(2)->toDateString());
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '2.000', 'consumed_at' => now()->subDay()->toDateString()]));

        $isValid = $this->currentCompanyContext()->run($company, function () use ($project, $material) {
            $ledger = app(StockLedgerService::class);

            return $ledger->isValid($ledger->events($project->id, $material->id));
        });

        $this->assertTrue($isValid);
    }

    /** LG7: current balance is exact. */
    public function test_lg7_current_balance_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.500');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '3.250']));

        $this->assertSame('7.250', $this->totalsFor($company, $project->id, $material->id)['balance']);
    }

    /** LG8: total_in is exact. */
    public function test_lg8_total_in_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '2.000']));

        $this->assertSame('12.000', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG9: total_out is exact. */
    public function test_lg9_total_out_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '2.000']));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_OUT', 'quantity' => '1.000']));

        $this->assertSame('3.000', $this->totalsFor($company, $project->id, $material->id)['total_out']);
    }

    /** LG10: 0.001 scale-3 precision is preserved exactly. */
    public function test_lg10_decimal_0001_exact(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '0.001']));

        $this->assertSame('0.001', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG11: no float drift across many fractional operations. */
    public function test_lg11_no_float_drift(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        for ($i = 0; $i < 10; $i++) {
            $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '0.100']));
        }

        $this->assertSame('1.000', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG12: a Receipt under a later-cancelled Order remains a positive event. */
    public function test_lg12_cancelled_order_receipt_remains_positive(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [$order] = $this->createReceivedStock($project->id, $material->id, '5.000');
        $fresh = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $fresh['updated_at']]);

        $this->assertSame('5.000', $this->totalsFor($company, $project->id, $material->id)['total_in']);
    }

    /** LG13: a draft Order without a Receipt contributes zero physical events. */
    public function test_lg13_draft_order_zero_physical(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload(['project_id' => $project->id]))->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload(['material_id' => $material->id]));

        $isEmpty = $this->currentCompanyContext()->run($company, function () use ($project, $material) {
            return app(StockLedgerService::class)->events($project->id, $material->id)->isEmpty();
        });

        $this->assertTrue($isEmpty);
    }

    /** LG14: no generic stock_movements table exists. */
    public function test_lg14_no_generic_stock_movement_table(): void
    {
        $this->assertFalse(Schema::hasTable('stock_movements'));
    }

    /** LG15: no persisted stock balance column/table exists anywhere. */
    public function test_lg15_no_stock_balance_column_or_table(): void
    {
        $this->assertFalse(Schema::hasTable('stock_balances'));
        $this->assertFalse(Schema::hasTable('stock_quantities'));
        $this->assertFalse(Schema::hasColumn('materials', 'stock_quantity'));
        $this->assertFalse(Schema::hasColumn('materials', 'balance'));
    }

    /** LG16: a negative ledger (simulated corrupt data) is reported honestly, never silently clamped. */
    public function test_lg16_corrupted_negative_ledger_not_clamped(): void
    {
        $ledger = app(StockLedgerService::class);
        $events = collect([
            ['date' => '2026-01-01', 'quantity' => '-5.000'],
        ]);

        $this->assertFalse($ledger->isValid($events));

        $totals = $ledger->totals($events);
        $this->assertSame('0.000', $totals['total_in']);
        $this->assertSame('5.000', $totals['total_out']);
        $this->assertSame('-5.000', $totals['balance']);
    }
}
