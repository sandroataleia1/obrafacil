<?php

namespace Tests\Feature\Stock;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E §80, SM1-SM12.
 */
class StockMovementApiTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** SM1: a GoodsReceipt line surfaces as type IN / source GOODS_RECEIPT. */
    public function test_sm1_goods_receipt_is_in(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        [, , $receipt] = $this->createReceivedStock($project->id, $material->id, '5.000');

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        $response->assertOk();
        $this->assertSame('IN', $response->json('data.0.type'));
        $this->assertSame('GOODS_RECEIPT', $response->json('data.0.source_type'));
        $this->assertSame($receipt['id'], $response->json('data.0.source_id'));
    }

    /** SM2: a Consumption surfaces as type OUT / source CONSUMPTION. */
    public function test_sm2_consumption_is_out(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $consumption = $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '3.000']))->json();

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));
        $row = collect($response->json('data'))->firstWhere('source_type', 'CONSUMPTION');

        $this->assertSame('OUT', $row['type']);
        $this->assertSame($consumption['id'], $row['source_id']);
    }

    /** SM3: an ADJUSTMENT_IN keeps its own type. */
    public function test_sm3_adjustment_in_type(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN']));

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        $this->assertSame('ADJUSTMENT_IN', $response->json('data.0.type'));
        $this->assertSame('MANUAL_ADJUSTMENT', $response->json('data.0.source_type'));
    }

    /** SM4: an ADJUSTMENT_OUT keeps its own type. */
    public function test_sm4_adjustment_out_type(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '10.000']));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'type' => 'ADJUSTMENT_OUT', 'quantity' => '4.000']));

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));
        $row = collect($response->json('data'))->firstWhere('type', 'ADJUSTMENT_OUT');

        $this->assertNotNull($row);
    }

    /** SM5: every movement's quantity is a positive magnitude. */
    public function test_sm5_quantities_positive_magnitude(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->createReceivedStock($project->id, $material->id, '10.000');
        $this->postJson($this->consumptionsEndpoint($project->id), $this->validConsumptionPayload(['material_id' => $material->id, 'quantity' => '3.000']));

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        foreach ($response->json('data') as $row) {
            $this->assertGreaterThan(0, (float) $row['quantity']);
        }
    }

    /** SM6: source ids point at the real underlying row. */
    public function test_sm6_source_ids(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $adjustment = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]))->json();

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        $this->assertSame($adjustment['id'], $response->json('data.0.source_id'));
    }

    /** SM7: movement ids are deterministic and unique. */
    public function test_sm7_deterministic_ids(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $adjustment = $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]))->json();

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        $this->assertSame("adjustment:{$adjustment['id']}", $response->json('data.0.id'));
    }

    /** SM8: movements are ordered occurred_at DESC. */
    public function test_sm8_chronology_desc(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => now()->subDays(2)->toDateString()]));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => now()->toDateString()]));

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));
        $dates = collect($response->json('data'))->pluck('occurred_at')->all();

        $this->assertSame($dates, collect($dates)->sortDesc()->values()->all());
    }

    /** SM9: same-date movements resolve deterministically (never depend on unordered SQL row order). */
    public function test_sm9_same_date_deterministic(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $today = now()->toDateString();
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => $today]));
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => $today]));

        $first = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id))->json('data');
        $second = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id))->json('data');

        $this->assertSame(collect($first)->pluck('id')->all(), collect($second)->pluck('id')->all());
    }

    /** SM10: material/project context are live relations on each movement. */
    public function test_sm10_material_project_live_relations(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company, ['name' => 'Cimento']);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id));

        $this->assertSame('Cimento', $response->json('data.0.material.name'));
        $this->assertSame($project->id, $response->json('data.0.project_id'));
    }

    /** SM11: movements are paginated. */
    public function test_sm11_pagination(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => now()->subDays($i)->toDateString()]));
        }

        $response = $this->getJson($this->stockMovementsEndpoint($project->id, $material->id).'?per_page=2');

        $this->assertCount(2, $response->json('data'));
        $this->assertSame(5, $response->json('meta.total'));
    }

    /** SM12: the movements query runs a fixed, small number of queries regardless of history size. */
    public function test_sm12_zero_n_plus_1(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        for ($i = 0; $i < 10; $i++) {
            $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'occurred_at' => now()->subDays($i)->toDateString()]));
        }

        DB::enableQueryLog();
        $this->getJson($this->stockMovementsEndpoint($project->id, $material->id).'?per_page=30')->assertOk();
        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThan(10, $queryCount);
    }
}
