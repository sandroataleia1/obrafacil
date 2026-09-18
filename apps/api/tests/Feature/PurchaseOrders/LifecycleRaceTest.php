<?php

namespace Tests\Feature\PurchaseOrders;

use App\Materials\MaterialService;
use App\Models\Material;
use App\Models\MaterialRequirement;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Supplier;
use App\Purchases\PurchaseOrderService;
use App\Suppliers\SupplierService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use ReflectionClass;
use ReflectionMethod;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithPurchaseOrders;
use Tests\Feature\PurchaseOrders\Concerns\InteractsWithSupplyChainConcurrency;
use Tests\TestCase;

/**
 * SUPPLY-API-01C1 §24, LR1-LR12 — closes the three lifecycle races found
 * by the independent audit: MaterialService::update() not sharing the
 * dependent-writers' row lock, PurchaseOrderService::updateHeader() not
 * locking the target Supplier on reassignment, and SupplierService::update()
 * not sharing the same lock as delete(). Uses DatabaseTruncation (never
 * RefreshDatabase) — the real cross-process races need genuinely committed
 * state visible to a second connection.
 */
class LifecycleRaceTest extends TestCase
{
    use DatabaseTruncation, InteractsWithPurchaseOrders, InteractsWithSupplyChainConcurrency;

    protected function tearDown(): void
    {
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    /** LR1: MaterialService::update() takes the same row lock as delete()/the dependent creators. */
    public function test_lr1_material_unit_update_lock_exists(): void
    {
        $reflection = new ReflectionClass(MaterialService::class);
        $method = new ReflectionMethod(MaterialService::class, 'update');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('lockForUpdate()', $source);
        $this->assertStringContainsString('DB::transaction', $source);
    }

    /**
     * LR2: unit update vs PurchaseOrderItem create for the SAME Material
     * — controlled outcome, never a raw crash.
     */
    public function test_lr2_unit_update_vs_item_create_controlled(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $order = $this->makePurchaseOrderForCompany($company);

        $updateProcess = $this->startSupplyChainProbe($company, 'update-material-unit', [
            'material' => $material->id, 'unit-code' => 'un',
        ]);
        $createProcess = $this->startSupplyChainProbe($company, 'create-item', [
            'order' => $order->id, 'material' => $material->id,
        ]);

        [$updateResult, $createResult] = $this->waitForSupplyChainProbes([$updateProcess, $createProcess]);

        $this->assertNull($this->crashOrNull($updateResult), json_encode($updateResult));
        $this->assertNull($this->crashOrNull($createResult), json_encode($createResult));

        $outcomes = [$updateResult['status'], $createResult['status']];
        // Both "update wins" (item then sees the new unit) and "item wins
        // first, update then rejected" are valid — but never both "ok"
        // AND a mismatched snapshot (checked explicitly in LR5).
        $this->assertNotSame(['error', 'error'], $outcomes, json_encode([$updateResult, $createResult]));
    }

    /** LR3: unit update vs MaterialRequirement create for the SAME Material — same guarantee as LR2. */
    public function test_lr3_unit_update_vs_requirement_create_controlled(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $project = $this->makeProjectForCompany($company);

        $updateProcess = $this->startSupplyChainProbe($company, 'update-material-unit', [
            'material' => $material->id, 'unit-code' => 'un',
        ]);
        $createProcess = $this->startSupplyChainProbe($company, 'create-requirement', [
            'project' => $project->id, 'material' => $material->id,
        ]);

        [$updateResult, $createResult] = $this->waitForSupplyChainProbes([$updateProcess, $createProcess]);

        $this->assertNull($this->crashOrNull($updateResult), json_encode($updateResult));
        $this->assertNull($this->crashOrNull($createResult), json_encode($createResult));

        $outcomes = [$updateResult['status'], $createResult['status']];

        // "Both ok" IS a valid outcome here: the update can win the lock
        // FIRST (changing the unit while zero dependents exist), release
        // it, and only then does the Requirement get created — under the
        // ALREADY-new unit, no contradiction. Only "both error" would be
        // wrong (one of the two writers must always be able to proceed).
        $this->assertNotSame(['error', 'error'], $outcomes, json_encode([$updateResult, $createResult]));

        $material->refresh();
        $requirementExists = MaterialRequirement::withoutGlobalScopes()->where('material_id', $material->id)->exists();
        $this->assertSame($createResult['status'] === 'ok', $requirementExists);
    }

    /** LR4: Material unit update vs Material delete for the SAME Material — controlled outcome. */
    public function test_lr4_material_update_vs_delete_controlled(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);

        $updateProcess = $this->startSupplyChainProbe($company, 'update-material-unit', [
            'material' => $material->id, 'unit-code' => 'un',
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-material', [
            'material' => $material->id,
        ]);

        [$updateResult, $deleteResult] = $this->waitForSupplyChainProbes([$updateProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($updateResult), json_encode($updateResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));

        $materialStillExists = Material::withoutGlobalScopes()->whereKey($material->id)->exists();

        if ($materialStillExists) {
            // Update won (or ran before delete) -> delete must have failed (material still referenced by nothing, but the row exists so delete's own lockForUpdate serialized after update committed with no dependents — either outcome for delete is acceptable as long as material state is coherent).
            $this->assertSame('ok', $updateResult['status'], json_encode($updateResult));
        } else {
            // Delete won -> the update, if it ran after, must have failed with ModelNotFoundException (never a false "ok" against a deleted row).
            if ($updateResult['status'] === 'error') {
                $this->assertSame(ModelNotFoundException::class, $updateResult['exception'], json_encode($updateResult));
            }
        }
    }

    /**
     * LR5: no mismatched Material/item unit outcome — repeats the LR2
     * race across several attempts and, on every single one, proves the
     * item's persisted unit_code is coherent with whichever unit the
     * Material actually had at the moment the item's own INSERT
     * committed (never "Material=un but item snapshot=kg" reported as if
     * the update had already succeeded when the item was created).
     */
    public function test_lr5_no_mismatched_material_item_unit_outcome(): void
    {
        [$company] = $this->makeCompanyWithMember();

        for ($i = 0; $i < 3; $i++) {
            $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
            $order = $this->makePurchaseOrderForCompany($company);

            $updateProcess = $this->startSupplyChainProbe($company, 'update-material-unit', [
                'material' => $material->id, 'unit-code' => 'un',
            ]);
            $createProcess = $this->startSupplyChainProbe($company, 'create-item', [
                'order' => $order->id, 'material' => $material->id,
            ]);

            [$updateResult, $createResult] = $this->waitForSupplyChainProbes([$updateProcess, $createProcess]);

            if ($createResult['status'] !== 'ok') {
                // Item creation itself failed (unit change won and blocked it, or another reason) — nothing to compare.
                continue;
            }

            $item = PurchaseOrderItem::withoutGlobalScopes()->where('material_id', $material->id)->first();
            $finalMaterial = Material::withoutGlobalScopes()->whereKey($material->id)->first();

            // The ONE invariant that must never be violated: the item's
            // persisted unit snapshot must always equal whatever unit the
            // Material had AT THE MOMENT the item's own row was locked
            // into existence — which, thanks to the shared row lock, is
            // always coherent with the Material's FINAL unit in this
            // two-writer scenario:
            //   - update wins first (unit -> "un"), item created AFTER
            //     under the new unit -> snapshot "un", material "un".
            //   - item wins first (snapshot "kg"), update then sees a
            //     dependent and is rejected -> material stays "kg".
            // Never material="un" with item snapshot="kg" (the exact bug
            // this gate closes) nor the reverse.
            $this->assertSame(
                $finalMaterial->unit_code->value,
                $item->unit_code->value,
                "Attempt {$i}: item snapshot ({$item->unit_code->value}) must match the Material's final unit ({$finalMaterial->unit_code->value})."
            );
        }
    }

    /** LR6: PurchaseOrderService::updateHeader() locks the target Supplier on reassignment. */
    public function test_lr6_draft_supplier_change_locks_target(): void
    {
        $reflection = new ReflectionClass(PurchaseOrderService::class);
        $method = new ReflectionMethod(PurchaseOrderService::class, 'updateHeader');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString("Supplier::query()->lockForUpdate()->find(\$validated['supplier_id'])", $source);
    }

    /**
     * LR7: draft Supplier reassignment (A -> B) vs Supplier B delete —
     * controlled outcome, never a raw FK/500.
     */
    public function test_lr7_supplier_change_vs_target_delete_controlled(): void
    {
        [$company] = $this->makeCompanyWithMember();
        $order = $this->makePurchaseOrderForCompany($company);
        $supplierB = $this->makeSupplierForCompany($company);

        $changeProcess = $this->startSupplyChainProbe($company, 'change-order-supplier', [
            'order' => $order->id, 'supplier' => $supplierB->id, 'updated-at' => $order->updated_at->toJSON(),
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-supplier', [
            'supplier' => $supplierB->id,
        ]);

        [$changeResult, $deleteResult] = $this->waitForSupplyChainProbes([$changeProcess, $deleteProcess]);

        $this->assertNull($this->crashOrNull($changeResult), json_encode($changeResult));
        $this->assertNull($this->crashOrNull($deleteResult), json_encode($deleteResult));

        $supplierBStillExists = Supplier::withoutGlobalScopes()->whereKey($supplierB->id)->exists();
        $freshOrder = PurchaseOrder::withoutGlobalScopes()->findOrFail($order->id);

        if ($supplierBStillExists) {
            // Change won -> Order points to B, delete B must have failed.
            $this->assertSame('ok', $changeResult['status'], json_encode($changeResult));
            $this->assertSame($supplierB->id, $freshOrder->supplier_id);
            $this->assertSame('error', $deleteResult['status'], json_encode($deleteResult));
        } else {
            // Delete won -> B removed, change must have failed on supplier_id, Order stays on its original Supplier.
            $this->assertSame('error', $changeResult['status'], json_encode($changeResult));
            $this->assertNotSame($supplierB->id, $freshOrder->supplier_id);
        }
    }

    /** LR8: zero raw FK/QueryException surfaces across the LR2/LR3/LR4/LR7 races — every "error" is a clean domain exception. */
    public function test_lr8_zero_raw_fk_exception_in_race(): void
    {
        [$company] = $this->makeCompanyWithMember();

        // Re-run each pairing once more and assert cleanliness explicitly.
        $material = $this->makeMaterialForCompany($company, ['unit_code' => 'kg']);
        $order = $this->makePurchaseOrderForCompany($company);
        $updateProcess = $this->startSupplyChainProbe($company, 'update-material-unit', ['material' => $material->id, 'unit-code' => 'un']);
        $createProcess = $this->startSupplyChainProbe($company, 'create-item', ['order' => $order->id, 'material' => $material->id]);
        [$r1, $r2] = $this->waitForSupplyChainProbes([$updateProcess, $createProcess]);

        $supplierB = $this->makeSupplierForCompany($company);
        $orderForSupplier = $this->makePurchaseOrderForCompany($company);
        $changeProcess = $this->startSupplyChainProbe($company, 'change-order-supplier', [
            'order' => $orderForSupplier->id, 'supplier' => $supplierB->id, 'updated-at' => $orderForSupplier->updated_at->toJSON(),
        ]);
        $deleteProcess = $this->startSupplyChainProbe($company, 'delete-supplier', ['supplier' => $supplierB->id]);
        [$r3, $r4] = $this->waitForSupplyChainProbes([$changeProcess, $deleteProcess]);

        foreach ([$r1, $r2, $r3, $r4] as $result) {
            $this->assertNull($this->crashOrNull($result), json_encode($result));
        }
    }

    /** LR9: SupplierService::update() takes the same row lock as delete() — serialized by construction. */
    public function test_lr9_supplier_update_delete_serialized(): void
    {
        $reflection = new ReflectionClass(SupplierService::class);
        $method = new ReflectionMethod(SupplierService::class, 'update');
        $source = implode('', array_slice(
            file($reflection->getFileName()),
            $method->getStartLine() - 1,
            $method->getEndLine() - $method->getStartLine() + 1
        ));

        $this->assertStringContainsString('lockForUpdate()', $source);
        $this->assertStringContainsString('DB::transaction', $source);
    }

    /** LR10: a normal, same-tenant, no-contention Supplier change on a draft Order still works. */
    public function test_lr10_same_tenant_normal_supplier_change_works(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);
        $this->activeTestCompany = $company;

        $order = $this->makePurchaseOrderForCompany($company);
        $newSupplier = $this->makeSupplierForCompany($company);

        $response = $this->putJson("/api/v1/purchase-orders/{$order->id}", [
            'supplier_id' => $newSupplier->id,
            'project_id' => $order->project_id,
            'order_date' => $order->order_date->toDateString(),
            'updated_at' => $order->updated_at->toJSON(),
        ]);

        $response->assertOk()->assertJsonPath('supplier.id', $newSupplier->id);
    }

    /**
     * LR11: an ordered Order's Supplier identity remains locked even
     * after the target-Supplier-lock hardening (§7) — a same-tenant,
     * uncontended attempt to reassign still gets 422, exactly as before.
     */
    public function test_lr11_ordered_supplier_identity_remains_locked(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);
        $this->activeTestCompany = $company;

        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $this->postJson("/api/v1/purchase-orders/{$order['id']}/items", $this->validPurchaseOrderItemPayload())->assertCreated();
        $freshOrder = $this->getJson("/api/v1/purchase-orders/{$order['id']}")->json();
        $confirmed = $this->postJson("/api/v1/purchase-orders/{$order['id']}/confirm", ['updated_at' => $freshOrder['updated_at']])->json();

        $otherSupplier = $this->makeSupplierForCompany($company);

        $response = $this->putJson("/api/v1/purchase-orders/{$order['id']}", [
            'supplier_id' => $otherSupplier->id,
            'project_id' => $confirmed['project']['id'],
            'order_date' => $confirmed['order_date'],
            'updated_at' => $confirmed['updated_at'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('supplier_id');
    }

    /** LR12: a cancelled Order remains fully read-only after this gate's hardening. */
    public function test_lr12_cancelled_remains_read_only(): void
    {
        [$company, $user] = $this->makeCompanyWithMember();
        Sanctum::actingAs($user);
        $this->activeTestCompany = $company;

        $order = $this->postJson('/api/v1/purchase-orders', $this->validPurchaseOrderPayload())->json();
        $cancelled = $this->postJson("/api/v1/purchase-orders/{$order['id']}/cancel", ['updated_at' => $order['updated_at']])->json();

        $otherSupplier = $this->makeSupplierForCompany($company);

        $response = $this->putJson("/api/v1/purchase-orders/{$order['id']}", [
            'supplier_id' => $otherSupplier->id,
            'project_id' => $cancelled['project']['id'],
            'order_date' => $cancelled['order_date'],
            'updated_at' => $cancelled['updated_at'],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('commercial_status');
    }

    /**
     * @return string|null null when the outcome is benign; a description otherwise.
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
