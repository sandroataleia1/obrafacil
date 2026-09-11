<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\ServiceOrder;
use App\ServiceOrders\ServiceOrderItemService;
use App\ServiceOrders\ServiceOrderLocker;
use App\ServiceOrders\ServiceOrderService;
use App\Support\CurrentCompanyContext;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

/**
 * BACKEND-06B §22. Test-only harness: launched as a genuinely separate OS
 * process/PostgreSQL connection (via Symfony\Component\Process\Process
 * from ServiceOrderConcurrencyTest), never called in-process, so the
 * "real PostgreSQL concurrency" the gate requires is real — two actual
 * backend connections, one of which really blocks on `FOR UPDATE` until
 * the other's transaction ends.
 *
 * Locks the target ServiceOrder first (same code path as every Service
 * method — ServiceOrderLocker), reports the exact moment the lock was
 * acquired, optionally holds it open for `--hold-ms` (simulating a slow
 * request) before performing the requested action and committing. The
 * caller compares `locked_at` timestamps across two runs to prove one was
 * genuinely blocked by the other's row lock, not just sequenced by luck.
 */
class ServiceOrderConcurrencyProbe extends Command
{
    protected $signature = 'concurrency:service-order
        {company : Company UUID}
        {order : ServiceOrder UUID}
        {action : start|complete|cancel|update-header|add-item|update-item|delete-item}
        {--hold-ms=0 : Milliseconds to sleep AFTER acquiring the row lock, BEFORE performing the action}
        {--item= : ServiceOrderItem UUID (update-item/delete-item)}
        {--catalog-item= : CatalogItem UUID (add-item)}
        {--quantity=1.000 : quantity (add-item/update-item)}
        {--travel-fee= : travel_fee override (update-header)}
        {--order-discount= : order_discount override (update-header)}
        {--title= : title override (update-header)}
        {--customer= : customer UUID (update-header)}
        {--address= : customer_address UUID (update-header)}
    ';

    protected $description = 'BACKEND-06B test harness — locks a ServiceOrder and performs one action in its own real DB connection/process.';

    public function handle(
        ServiceOrderLocker $locker,
        ServiceOrderService $orderService,
        ServiceOrderItemService $itemService,
    ): int {
        // BACKEND-06A §48: this harness directly manipulates ServiceOrder
        // rows by id/action, bypassing HTTP auth/validation entirely — it
        // must never run anywhere real. The concurrency tests that depend
        // on it only ever run against `testing`, and a developer only
        // ever runs it against `local`.
        if (! app()->environment(['local', 'testing'])) {
            $this->error('ServiceOrderConcurrencyProbe is a test-only harness and refuses to run outside local/testing.');

            return self::FAILURE;
        }

        $companyId = (string) $this->argument('company');
        $orderId = (string) $this->argument('order');
        $action = (string) $this->argument('action');
        $holdMs = (int) $this->option('hold-ms');

        $company = Company::query()->findOrFail($companyId);

        $result = [
            'action' => $action,
            'pid' => getmypid(),
        ];

        try {
            app(CurrentCompanyContext::class)->run($company, function () use (
                $locker, $orderService, $itemService, $orderId, $action, $holdMs, &$result
            ) {
                DB::transaction(function () use ($locker, $orderService, $itemService, $orderId, $action, $holdMs, &$result) {
                    // Same lock every Service method takes as its first
                    // statement — acquiring it here first, then holding it
                    // open, is what lets us prove a second process really
                    // blocks on it (rather than merely running later).
                    $locker->lock($orderId);
                    $result['locked_at'] = microtime(true);

                    if ($holdMs > 0) {
                        usleep($holdMs * 1000);
                    }

                    $result['outcome'] = $this->dispatch($orderService, $itemService, $orderId, $action);
                });
            });

            $result['status'] = 'ok';
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
        ServiceOrderService $orderService,
        ServiceOrderItemService $itemService,
        string $orderId,
        string $action,
    ): array {
        switch ($action) {
            case 'start':
                $order = $orderService->start($orderId);

                return ['status' => $order->status->value, 'started_at' => (string) $order->started_at];

            case 'complete':
                $order = $orderService->complete($orderId);

                return ['status' => $order->status->value, 'completed_at' => (string) $order->completed_at];

            case 'cancel':
                $order = $orderService->cancel($orderId, 'Concurrency probe');

                return ['status' => $order->status->value, 'cancelled_at' => (string) $order->cancelled_at];

            case 'update-header':
                $current = ServiceOrder::query()->findOrFail($orderId);
                $payload = [
                    'customer_id' => $this->option('customer') ?? $current->customer_id,
                    'customer_address_id' => $this->option('address') ?? $current->customer_address_id,
                    'customer_contact_id' => $current->customer_contact_id,
                    'responsible_user_id' => $current->responsible_user_id,
                    'title' => $this->option('title') ?? $current->title,
                    'description' => $current->description,
                    'scheduled_start_at' => null,
                    'scheduled_end_at' => null,
                    'order_discount' => $this->option('order-discount') ?? (string) $current->order_discount,
                    'travel_fee' => $this->option('travel-fee') ?? (string) $current->travel_fee,
                    'notes' => $current->notes,
                ];
                $order = $orderService->updateHeader($orderId, $payload);

                return [
                    'subtotal' => (string) $order->subtotal,
                    'order_discount' => (string) $order->order_discount,
                    'travel_fee' => (string) $order->travel_fee,
                    'total' => (string) $order->total,
                ];

            case 'add-item':
                $item = $itemService->addItem($orderId, [
                    'catalog_item_id' => $this->option('catalog-item'),
                    'quantity' => $this->option('quantity'),
                ]);

                return ['item_id' => $item->id, 'sort_order' => $item->sort_order, 'line_total' => (string) $item->line_total];

            case 'update-item':
                $item = $itemService->updateItem($orderId, (string) $this->option('item'), [
                    'quantity' => $this->option('quantity'),
                ]);

                return ['item_id' => $item->id, 'line_total' => (string) $item->line_total];

            case 'delete-item':
                $itemService->deleteItem($orderId, (string) $this->option('item'));

                return ['deleted' => (string) $this->option('item')];

            default:
                throw new InvalidArgumentException("Unknown action [{$action}].");
        }
    }
}
