<?php

namespace Tests\Feature\Stock;

use App\Stock\StockPositionService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Stock\Concerns\InteractsWithStock;
use Tests\TestCase;

/**
 * SUPPLY-API-01E1 §15, STR1-STR10. Proves StockPositionService's own
 * public boundary is tenant-safe by construction — not merely because
 * StockPositionController happens to resolve Project/Material via
 * Eloquent first.
 */
class StockTenantDefenseTest extends TestCase
{
    use InteractsWithStock, RefreshDatabase;

    /** STR1: direct getPosition() same-tenant works. */
    public function test_str1_direct_get_position_same_tenant_works(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id, 'quantity' => '10.000']));

        $position = $this->currentCompanyContext()->run($companyA, function () use ($projectA, $materialA) {
            return app(StockPositionService::class)->getPosition($projectA->id, $materialA->id);
        });

        $this->assertSame('10.000', $position['stock_quantity']);
    }

    /** STR2: direct getPosition() foreign-tenant fails. */
    public function test_str2_direct_get_position_foreign_tenant_fails(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id]));

        [$companyB] = $this->makeCompanyWithMember();

        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA) {
            $this->expectException(ModelNotFoundException::class);
            app(StockPositionService::class)->getPosition($projectA->id, $materialA->id);
        });
    }

    /** STR3: direct listMovements() same-tenant works. */
    public function test_str3_direct_list_movements_same_tenant_works(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id]));

        $movements = $this->currentCompanyContext()->run($companyA, function () use ($projectA, $materialA) {
            return app(StockPositionService::class)->listMovements($projectA->id, $materialA->id, []);
        });

        $this->assertSame(1, $movements->total());
    }

    /** STR4: direct listMovements() foreign-tenant fails. */
    public function test_str4_direct_list_movements_foreign_tenant_fails(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id]));

        [$companyB] = $this->makeCompanyWithMember();

        $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA) {
            $this->expectException(ModelNotFoundException::class);
            app(StockPositionService::class)->listMovements($projectA->id, $materialA->id, []);
        });
    }

    /**
     * STR5: the leak this whole gate exists to close — a foreign
     * listMovements() call must return ZERO Company A rows. This is the
     * assertion that would have failed against the pre-fix code (which
     * ran `movementsUnion()` with no `company_id` predicate at all).
     */
    public function test_str5_foreign_movements_return_zero_rows(): void
    {
        [$companyA] = $this->actingAsNewCompanyMember();
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id, 'type' => 'ADJUSTMENT_IN', 'quantity' => '5.000']));
        $this->postJson($this->consumptionsEndpoint($projectA->id), $this->validConsumptionPayload(['material_id' => $materialA->id, 'quantity' => '2.000']));
        [, , $receiptA] = $this->createReceivedStock($projectA->id, $materialA->id, '3.000');

        [$companyB] = $this->makeCompanyWithMember();

        $leaked = null;
        try {
            $this->currentCompanyContext()->run($companyB, function () use ($projectA, $materialA, &$leaked) {
                $movements = app(StockPositionService::class)->listMovements($projectA->id, $materialA->id, []);
                $leaked = $movements->total();
            });
            $this->fail('Expected ModelNotFoundException, none thrown.');
        } catch (ModelNotFoundException) {
            // Expected — resolvePair() rejects before any row is materialized.
        }

        $this->assertNull($leaked, 'No movement rows must ever be materialized for a rejected foreign call.');
    }

    /**
     * STR6: every one of the three movements branches is explicitly
     * company-scoped (source code proof) — the goods-receipt branch
     * filters BOTH `goods_receipt_items.company_id` and
     * `purchase_orders.company_id`, so 4 predicates across 3 branches.
     */
    public function test_str6_movements_raw_branches_company_scoped(): void
    {
        $source = file_get_contents(app_path('Stock/StockPositionService.php'));
        $start = strpos($source, 'private function movementsUnion');
        $movementsUnionBody = substr($source, $start, strpos($source, "\n    }\n", $start) - $start);

        $this->assertStringContainsString("where('goods_receipt_items.company_id', \$companyId)", $movementsUnionBody);
        $this->assertStringContainsString("where('purchase_orders.company_id', \$companyId)", $movementsUnionBody);
        $this->assertSame(4, substr_count($movementsUnionBody, "company_id', \$companyId)"));
    }

    /** STR7: listPositions final Project/Material joins are company-scoped (source code proof). */
    public function test_str7_list_positions_final_joins_company_scoped(): void
    {
        $source = file_get_contents(app_path('Stock/StockPositionService.php'));

        $this->assertStringContainsString("where('projects.company_id', \$companyId)", $source);
        $this->assertStringContainsString("where('materials.company_id', \$companyId)", $source);
    }

    /** STR8: HTTP stock detail foreign continues to be a 404. */
    public function test_str8_http_stock_detail_foreign_404(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB, $userB] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userB);

        $this->getJson($this->stockDetailEndpoint($projectA->id, $materialA->id))->assertStatus(404);
    }

    /** STR9: HTTP movements foreign continues to be a 404. */
    public function test_str9_http_movements_foreign_404(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA);
        $materialA = $this->makeMaterialForCompany($companyA);

        [$companyB, $userB] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userB);

        $this->getJson($this->stockMovementsEndpoint($projectA->id, $materialA->id))->assertStatus(404);
    }

    /** STR10: project.number is formatted as "OBR-000001", never a bare integer. */
    public function test_str10_project_number_is_obr_formatted_string(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        DB::table('projects')->where('id', $project->id)->update(['number' => 1]);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id]));

        $detail = $this->getJson($this->stockDetailEndpoint($project->id, $material->id));
        $detail->assertOk()->assertJson(['project' => ['number' => 'OBR-000001']]);

        $list = $this->getJson($this->stockPositionsEndpoint());
        $list->assertJson(['data' => [['project' => ['number' => 'OBR-000001']]]]);
    }

    /**
     * §14: Company A and B with SAME Project/Material names but
     * independent physical data — under Company B, the list endpoint
     * must show only B's pair, never A's.
     */
    public function test_str11_list_tenant_isolation_same_names(): void
    {
        [$companyA, $userA] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userA);
        $projectA = $this->makeProjectForCompany($companyA, ['name' => 'Obra Reforma']);
        $materialA = $this->makeMaterialForCompany($companyA, ['name' => 'Cimento CP-II']);
        $this->postJson($this->adjustmentsEndpoint($projectA->id), $this->validAdjustmentPayload(['material_id' => $materialA->id]));

        [$companyB, $userB] = $this->makeCompanyWithMember();
        Sanctum::actingAs($userB);
        $projectB = $this->makeProjectForCompany($companyB, ['name' => 'Obra Reforma']);
        $materialB = $this->makeMaterialForCompany($companyB, ['name' => 'Cimento CP-II']);
        $this->postJson($this->adjustmentsEndpoint($projectB->id), $this->validAdjustmentPayload(['material_id' => $materialB->id]));

        $response = $this->getJson($this->stockPositionsEndpoint());

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame($projectB->id, $data[0]['project']['id']);
        $this->assertSame($materialB->id, $data[0]['material']['id']);
    }

    /** STR12 (bonus): direct same-tenant proof stays available for internal callers, mirroring §12's requirement. */
    public function test_str12_same_tenant_internal_usage_not_broken(): void
    {
        [$company] = $this->actingAsNewCompanyMember();
        $project = $this->makeProjectForCompany($company);
        $material = $this->makeMaterialForCompany($company);
        $this->postJson($this->adjustmentsEndpoint($project->id), $this->validAdjustmentPayload(['material_id' => $material->id, 'quantity' => '7.000']));

        [$position, $movements] = $this->currentCompanyContext()->run($company, function () use ($project, $material) {
            return [
                app(StockPositionService::class)->getPosition($project->id, $material->id),
                app(StockPositionService::class)->listMovements($project->id, $material->id, []),
            ];
        });

        $this->assertSame('7.000', $position['stock_quantity']);
        $this->assertSame(1, $movements->total());
    }
}
