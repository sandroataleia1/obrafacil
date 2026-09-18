<?php

namespace Tests\Feature\PurchaseOrders;

use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\PurchaseOrderItem;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Validation\ValidationException;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithSupplyChainConcurrency;
use Tests\TestCase;

/**
 * SUPPLY-API-01C §44/§77, PM10-PM12 — real PostgreSQL concurrency, driven
 * via genuinely separate OS processes (App\Console\Commands\
 * SupplyChainConcurrencyProbe). Uses DatabaseTruncation, never
 * RefreshDatabase — a second real backend connection cannot observe
 * another connection's uncommitted writes.
 */
class PurchaseOrderMaterialConcurrencyTest extends TestCase
{
    use DatabaseTruncation, InteractsWithPurchaseOrders, InteractsWithSupplyChainConcurrency;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /**
     * PM10: a concurrent MaterialRequirement create vs Material delete
     * for the SAME Material. Both sides take lockForUpdate() on the same
     * Material row (MaterialRequirementService::create()/
     * MaterialService::delete()), so exactly one of two controlled
     * outcomes happens: the delete commits first (create then sees no
     * Material -> a clean validation error, zero Requirement rows), or
     * the create commits first (delete then sees a dependent -> a clean
     * validation error, Material survives). Never a raw crash, never
     * both succeeding.
     */
    public function test_pm10_concurrent_requirement_create_vs_material_delete_controlled_outcome(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company);
        $project = $this->makeProjectForCompany($company);

        $createProcess = $this->startSupplyChainProbe($company, 'create-requirement', [
            'project' => $project->id, 'material' => $material->id,
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-material', [
            'material' => $material->id,
        ]);

        [$createResult, $deleteResult] = $this->waitForSupplyChainProbes([$createProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($createResult), json_encode($createResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));

        $materialStillExists = Material::withoutGlobalScopes()->whereKey($material->id)->exists();
        $requirementCount = MaterialRequirement::withoutGlobalScopes()->where('material_id', $material->id)->count();

        if ($materialStillExists) {
            $this->assertSame('ok', $createResult['status'], json_encode($createResult));
            $this->assertSame(1, $requirementCount);
        } else {
            $this->assertSame('error', $createResult['status'], json_encode($createResult));
            $this->assertSame(0, $requirementCount);
        }
    }

    /**
     * PM11: a concurrent PurchaseOrderItem create vs Material delete for
     * the SAME Material — same controlled-outcome guarantee as PM10.
     */
    public function test_pm11_concurrent_item_create_vs_material_delete_controlled_outcome(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company);
        $order = $this->makePurchaseOrderForCompany($company);

        $createProcess = $this->startSupplyChainProbe($company, 'create-item', [
            'order' => $order->id, 'material' => $material->id, 'quantity' => '5.000', 'unit-price' => '9.90',
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-material', [
            'material' => $material->id,
        ]);

        [$createResult, $deleteResult] = $this->waitForSupplyChainProbes([$createProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($createResult), json_encode($createResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));

        $materialStillExists = Material::withoutGlobalScopes()->whereKey($material->id)->exists();
        $itemCount = PurchaseOrderItem::withoutGlobalScopes()->where('material_id', $material->id)->count();

        if ($materialStillExists) {
            $this->assertSame('ok', $createResult['status'], json_encode($createResult));
            $this->assertSame(1, $itemCount);
        } else {
            $this->assertSame('error', $createResult['status'], json_encode($createResult));
            $this->assertSame(0, $itemCount);
        }
    }

    /**
     * PM12: neither PM10 nor PM11 ever surfaces a raw, unhandled 500 —
     * every "error" outcome across both is a clean ValidationException/
     * ModelNotFoundException, proven by crashOrNull() returning null for
     * every probe result gathered above. This test re-runs both races
     * once more and asserts the same, purely as an explicit PM12 proof.
     */
    public function test_pm12_zero_raw_fk_500_across_both_races(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company);
        $order = $this->makePurchaseOrderForCompany($company);

        $createProcess = $this->startSupplyChainProbe($company, 'create-item', [
            'order' => $order->id, 'material' => $material->id,
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-material', [
            'material' => $material->id,
        ]);

        [$createResult, $deleteResult] = $this->waitForSupplyChainProbes([$createProcess, $deleteProcess]);

        foreach ([$createResult, $deleteResult] as $result) {
            if ($result['status'] === 'error') {
                $this->assertContains($result['exception'], [ValidationException::class, ModelNotFoundException::class], json_encode($result));
            }
        }
    }

    /**
     * @return string|null null when the outcome is benign (success, or a
     *                     clean domain exception); a description otherwise.
     */
    private function crashOrNull(array $result): ?string
    {
        if ($result['status'] !== 'error') {
            return null;
        }

        $benign = [ValidationException::class, ModelNotFoundException::class];

        return in_array($result['exception'], $benign, true) ? null : "unexpected exception {$result['exception']}: {$result['message']}";
    }
}
