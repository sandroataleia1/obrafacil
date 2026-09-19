<?php

namespace App\Console\Commands;

use App\MaterialRequirements\MaterialRequirementService;
use App\Materials\MaterialService;
use App\Models\Company;
use App\Models\Material;
use App\Models\Project;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Purchases\GoodsReceiptService;
use App\Purchases\PurchaseOrderItemService;
use App\Purchases\PurchaseOrderLocker;
use App\Purchases\PurchaseOrderService;
use App\Purchases\PurchaseOrderStatusService;
use App\Stock\MaterialConsumptionService;
use App\Stock\StockAdjustmentService;
use App\Suppliers\SupplierService;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * SUPPLY-API-01C §44/§46-51/§80. Test-only harness: launched as a
 * genuinely separate OS process/PostgreSQL connection (via
 * Symfony\Component\Process\Process from the concurrency tests), never
 * called in-process — mirrors ProjectConcurrencyProbe/
 * MaterialRequirementConcurrencyProbe exactly. One flexible command
 * covers every real-lock race this gate needs to prove: Material delete
 * vs MaterialRequirement/PurchaseOrderItem create (both serialize on the
 * same Material row lock — PM10/PM11), PurchaseOrder number allocation
 * (PC1/PC2), PurchaseOrderItem unique-per-Material creation (PC3/PC4),
 * confirm vs delete-last-item (PC5), and stale header/item writers
 * (PC6/PC7 — `update-header`/`update-item` lock the parent Order FIRST,
 * report the exact moment, then optionally hold it open for `--hold-ms`
 * before performing the write, mirroring ProjectConcurrencyProbe's
 * `update` action exactly).
 */
class SupplyChainConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:supply
        {company : Company UUID}
        {action : create-order|create-requirement|create-item|delete-material|confirm-order|delete-item|update-header|update-item|update-material-unit|delete-supplier|change-order-supplier|create-receipt|cancel-order|return-to-draft-order|delete-receipt|create-consumption|create-adjustment}
        {--project= : Project UUID}
        {--supplier= : Supplier UUID}
        {--material= : Material UUID}
        {--order= : PurchaseOrder UUID}
        {--item= : PurchaseOrderItem UUID}
        {--receipt= : GoodsReceipt UUID}
        {--updated-at= : updated_at precondition}
        {--quantity=1.000 : quantity (create-requirement/create-item/update-item/create-receipt/create-consumption/create-adjustment)}
        {--unit-price=10.00 : unit_price (create-item/update-item)}
        {--notes=probe : notes (update-header)}
        {--unit-code=un : unit_code (update-material-unit)}
        {--received-at= : received_at (create-receipt), defaults to today}
        {--consumed-at= : consumed_at (create-consumption), defaults to today}
        {--occurred-at= : occurred_at (create-adjustment), defaults to today}
        {--type=ADJUSTMENT_IN : type (create-adjustment)}
        {--hold-ms=0 : milliseconds to sleep AFTER acquiring the row lock, BEFORE writing (update-header/update-item/confirm-order/cancel-order/return-to-draft-order)}
    ';

    protected $description = 'SUPPLY-API-01C/01E test harness — performs one supply-chain action in its own real DB connection/process.';

    public function handle(
        MaterialService $materialService,
        MaterialRequirementService $requirementService,
        PurchaseOrderService $orderService,
        PurchaseOrderItemService $itemService,
        PurchaseOrderStatusService $statusService,
        SupplierService $supplierService,
        GoodsReceiptService $goodsReceiptService,
        PurchaseOrderLocker $locker,
        MaterialConsumptionService $consumptionService,
        StockAdjustmentService $adjustmentService,
    ): int {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('SupplyChainConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $action = (string) $this->argument('action');
        $company = Company::query()->findOrFail($companyId);

        $result = ['action' => $action, 'pid' => getmypid()];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use (
                $materialService, $requirementService, $orderService, $itemService, $statusService, $supplierService, $goodsReceiptService, $locker, $consumptionService, $adjustmentService, $action, &$result
            ) {
                $result['outcome'] = $this->dispatch($materialService, $requirementService, $orderService, $itemService, $statusService, $supplierService, $goodsReceiptService, $locker, $consumptionService, $adjustmentService, $action, $result);
            });

            $result['status'] ??= 'ok';
        } catch (Throwable $e) {
            $result['status'] = 'error';
            $result['exception'] = $e::class;
            $result['message'] = $e->getMessage();
        }

        $result['finished_at'] = microtime(true);

        $this->output->writeln(json_encode($result));

        return self::SUCCESS;
    }

    /**
     * @return array<string, mixed>
     */
    private function dispatch(
        MaterialService $materialService,
        MaterialRequirementService $requirementService,
        PurchaseOrderService $orderService,
        PurchaseOrderItemService $itemService,
        PurchaseOrderStatusService $statusService,
        SupplierService $supplierService,
        GoodsReceiptService $goodsReceiptService,
        PurchaseOrderLocker $locker,
        MaterialConsumptionService $consumptionService,
        StockAdjustmentService $adjustmentService,
        string $action,
        array &$result,
    ): array {
        switch ($action) {
            case 'create-order':
                $order = $orderService->create([
                    'supplier_id' => (string) $this->option('supplier'),
                    'project_id' => (string) $this->option('project'),
                    'order_date' => now()->toDateString(),
                ]);

                return ['id' => $order->id, 'number' => $order->number];

            case 'create-requirement':
                $project = Project::query()->findOrFail((string) $this->option('project'));
                $requirement = $requirementService->create($project, [
                    'material_id' => (string) $this->option('material'),
                    'required_quantity' => (string) $this->option('quantity'),
                ]);

                return ['id' => $requirement->id];

            case 'create-item':
                $order = PurchaseOrder::query()->findOrFail((string) $this->option('order'));
                $item = $itemService->addItem($order, [
                    'material_id' => (string) $this->option('material'),
                    'description' => 'Probe item',
                    'quantity' => (string) $this->option('quantity'),
                    'unit_price' => (string) $this->option('unit-price'),
                ]);

                return ['id' => $item->id];

            case 'delete-material':
                $material = Material::query()->findOrFail((string) $this->option('material'));
                $materialService->delete($material);

                return ['deleted' => (string) $this->option('material')];

            case 'confirm-order':
                $updatedAt = (string) $this->option('updated-at');
                if ($updatedAt === '') {
                    throw new InvalidArgumentException('--updated-at is required for confirm-order.');
                }

                return DB::transaction(function () use ($statusService, $locker, $updatedAt, &$result) {
                    $locker->lock((string) $this->option('order'));
                    $result['locked_at'] = microtime(true);

                    $holdMs = (int) $this->option('hold-ms');
                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $order = $statusService->confirm((string) $this->option('order'), $updatedAt);

                    return ['commercial_status' => $order->commercial_status->value];
                });

            case 'delete-item':
                $order = PurchaseOrder::query()->findOrFail((string) $this->option('order'));
                $itemService->deleteItem($order, (string) $this->option('item'));

                return ['deleted' => (string) $this->option('item')];

            case 'update-header':
                return DB::transaction(function () use ($orderService, $locker, &$result) {
                    $locker->lock((string) $this->option('order'));
                    $result['locked_at'] = microtime(true);

                    $holdMs = (int) $this->option('hold-ms');
                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $order = $orderService->updateHeader((string) $this->option('order'), [
                        'notes' => (string) $this->option('notes'),
                        'updated_at' => (string) $this->option('updated-at'),
                    ]);

                    return ['notes' => $order->notes, 'updated_at' => $order->updated_at?->toJSON()];
                });

            case 'update-item':
                return DB::transaction(function () use ($itemService, $locker, &$result) {
                    $order = $locker->lock((string) $this->option('order'));
                    $result['locked_at'] = microtime(true);

                    $holdMs = (int) $this->option('hold-ms');
                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $item = $itemService->updateItem($order, (string) $this->option('item'), [
                        'description' => 'Probe update',
                        'quantity' => (string) $this->option('quantity'),
                        'unit_price' => (string) $this->option('unit-price'),
                        'updated_at' => (string) $this->option('updated-at'),
                    ]);

                    return ['id' => $item->id, 'updated_at' => $item->updated_at?->toJSON()];
                });

            case 'update-material-unit':
                $material = Material::query()->findOrFail((string) $this->option('material'));
                $updated = $materialService->update($material, [
                    'name' => $material->name,
                    'unit_code' => (string) $this->option('unit-code'),
                ]);

                return ['unit_code' => $updated->unit_code->value];

            case 'delete-supplier':
                $supplier = Supplier::query()->findOrFail((string) $this->option('supplier'));
                $supplierService->delete($supplier);

                return ['deleted' => (string) $this->option('supplier')];

            case 'change-order-supplier':
                $order = $orderService->updateHeader((string) $this->option('order'), [
                    'supplier_id' => (string) $this->option('supplier'),
                    'updated_at' => (string) $this->option('updated-at'),
                ]);

                return ['supplier_id' => $order->supplier_id];

            case 'create-receipt':
                $order = PurchaseOrder::query()->findOrFail((string) $this->option('order'));
                $receivedAt = (string) $this->option('received-at');
                $receipt = $goodsReceiptService->create($order, [
                    'received_at' => $receivedAt !== '' ? $receivedAt : now()->toDateString(),
                    'items' => [
                        ['purchase_order_item_id' => (string) $this->option('item'), 'quantity' => (string) $this->option('quantity')],
                    ],
                ]);

                return ['id' => $receipt->id];

            case 'cancel-order':
                return DB::transaction(function () use ($statusService, $locker, &$result) {
                    $locker->lock((string) $this->option('order'));
                    $result['locked_at'] = microtime(true);

                    $holdMs = (int) $this->option('hold-ms');
                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $order = $statusService->cancel((string) $this->option('order'), (string) $this->option('updated-at'));

                    return ['commercial_status' => $order->commercial_status->value];
                });

            case 'return-to-draft-order':
                return DB::transaction(function () use ($statusService, $locker, &$result) {
                    $locker->lock((string) $this->option('order'));
                    $result['locked_at'] = microtime(true);

                    $holdMs = (int) $this->option('hold-ms');
                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $order = $statusService->returnToDraft((string) $this->option('order'), (string) $this->option('updated-at'));

                    return ['commercial_status' => $order->commercial_status->value];
                });

            case 'delete-receipt':
                $order = PurchaseOrder::query()->findOrFail((string) $this->option('order'));
                $goodsReceiptService->delete($order, (string) $this->option('receipt'));

                return ['deleted' => (string) $this->option('receipt')];

            case 'create-consumption':
                $project = Project::query()->findOrFail((string) $this->option('project'));
                $consumedAt = (string) $this->option('consumed-at');
                $consumption = $consumptionService->create($project, [
                    'material_id' => (string) $this->option('material'),
                    'quantity' => (string) $this->option('quantity'),
                    'consumed_at' => $consumedAt !== '' ? $consumedAt : now()->toDateString(),
                ]);

                return ['id' => $consumption->id];

            case 'create-adjustment':
                $project = Project::query()->findOrFail((string) $this->option('project'));
                $occurredAt = (string) $this->option('occurred-at');
                $adjustment = $adjustmentService->create($project, [
                    'material_id' => (string) $this->option('material'),
                    'type' => (string) $this->option('type'),
                    'quantity' => (string) $this->option('quantity'),
                    'occurred_at' => $occurredAt !== '' ? $occurredAt : now()->toDateString(),
                ]);

                return ['id' => $adjustment->id];

            default:
                throw new InvalidArgumentException("Unknown action [{$action}].");
        }
    }
}
