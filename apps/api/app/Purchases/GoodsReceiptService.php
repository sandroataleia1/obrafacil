<?php

namespace App\Purchases;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\Material;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Stock\StockLedgerService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01D §14/§19/§56-59. Controller stays thin.
 *
 * §14/§58: every method locks the PARENT PurchaseOrder FIRST — this is
 * what serializes a GoodsReceipt create/delete against confirm/cancel/
 * return-to-draft, item add/update/delete, and another concurrent
 * Receipt for the same Order (§20/§41/§42). GoodsReceipt does NOT lock
 * Material — PurchaseOrderItem already preserves Material/unit identity,
 * so there is nothing left to protect at that level (§58/§80).
 *
 * §19: `create()` validates the ENTIRE payload against currently-persisted
 * state (current items, current received totals) BEFORE writing anything
 * — one invalid line means zero Receipt, zero ReceiptItem (§21).
 *
 * §57: never trusts the PurchaseOrder/GoodsReceipt Model instance the
 * caller already holds — both re-resolve via PurchaseOrderLocker/a
 * tenant-scoped nested query.
 */
class GoodsReceiptService
{
    public function __construct(
        private readonly PurchaseOrderLocker $locker,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
        private readonly StockLedgerService $ledger,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function create(PurchaseOrder|string $purchaseOrder, array $validated): GoodsReceipt
    {
        return DB::transaction(function () use ($purchaseOrder, $validated) {
            $lockedOrder = $this->locker->lock($purchaseOrder);

            // §13: only a confirmed (ordered) commercial fact can receive
            // a physical fact against it.
            if ($lockedOrder->commercial_status !== PurchaseOrderCommercialStatus::Ordered) {
                throw ValidationException::withMessages([
                    'commercial_status' => 'Somente pedidos confirmados podem receber materiais.',
                ]);
            }

            // §15/§65: current items loaded fresh, inside this same lock
            // — never trusts a caller-passed array. Lines are resolved
            // against THIS map, never a loose PurchaseOrderItem::find().
            $itemsById = $lockedOrder->items()->get()->keyBy('id');

            // §16: current received totals per Item, queried fresh
            // inside this same lock — the lock is exactly what makes two
            // concurrent Receipts for the same Item serialize instead of
            // both reading a stale "0 received so far".
            $receivedByItemId = $this->receivedTotals($itemsById->keys());

            $seenItemIds = [];
            $linesToCreate = [];

            foreach ($validated['items'] as $index => $line) {
                $itemId = $line['purchase_order_item_id'];

                // §12: duplicate line for the same Item within this one payload.
                if (in_array($itemId, $seenItemIds, true)) {
                    throw ValidationException::withMessages([
                        "items.{$index}.purchase_order_item_id" => 'Cada item só pode aparecer uma vez neste recebimento.',
                    ]);
                }
                $seenItemIds[] = $itemId;

                // §15: the Item must belong to THIS locked Order — never a foreign Order's item, never a cross-tenant one.
                $item = $itemsById->get($itemId);
                if ($item === null) {
                    throw ValidationException::withMessages([
                        "items.{$index}.purchase_order_item_id" => 'Item inválido para este pedido.',
                    ]);
                }

                $orderedQuantity = Quantity::normalize((string) $item->quantity);
                $alreadyReceived = $receivedByItemId->get($itemId, '0.000');
                $newQuantity = Quantity::normalize((string) $line['quantity']);
                $projectedTotal = Quantity::add($alreadyReceived, $newQuantity);

                // §16/§20: never over-receipt — checked against the
                // CURRENT persisted total, read inside the Order lock.
                if (Quantity::compare($projectedTotal, $orderedQuantity) > 0) {
                    throw ValidationException::withMessages([
                        "items.{$index}.quantity" => 'A quantidade recebida não pode exceder o saldo do pedido.',
                    ]);
                }

                $linesToCreate[] = ['purchase_order_item_id' => $itemId, 'quantity' => $newQuantity];
            }

            // §59: header created only after every line has already been
            // validated against currently-persisted state — nothing to
            // roll back mid-way besides the whole transaction itself.
            $receipt = GoodsReceipt::create([
                'purchase_order_id' => $lockedOrder->id,
                'received_at' => $validated['received_at'],
                'notes' => $validated['notes'] ?? null,
            ]);

            foreach ($linesToCreate as $line) {
                $receipt->items()->create($line);
            }

            // §53: monotonic version bump via PurchaseOrderVersionClock (SUPPLY-API-01C1), through the model's own updateTimestamps() override.
            $lockedOrder->touch();

            return $receipt->load('items');
        });
    }

    /**
     * SUPPLY-API-01E §31-37/§70-72. Before removing anything, discover
     * every distinct Material this Receipt's lines touch, lock those
     * Material rows in deterministic ASC id order (§31/§71 — NEVER
     * payload/relation order, which is what avoids a deadlock against
     * MaterialConsumptionService/StockAdjustmentService/MaterialService,
     * none of which ever lock more than one Material at a time), then
     * simulate the timeline for each affected Material with this
     * Receipt's events excluded (§32). A single Material going negative
     * blocks the WHOLE delete — zero lines removed (§35).
     */
    public function delete(PurchaseOrder|string $purchaseOrder, GoodsReceipt|string $goodsReceipt): void
    {
        DB::transaction(function () use ($purchaseOrder, $goodsReceipt) {
            $lockedOrder = $this->locker->lock($purchaseOrder);

            $receiptId = $goodsReceipt instanceof GoodsReceipt ? $goodsReceipt->id : $goodsReceipt;

            // §23: nested to the locked Order — a Receipt id from a
            // different Order (or a different tenant) is indistinguishable
            // from "doesn't exist" — a real 404.
            $receipt = GoodsReceipt::query()->where('purchase_order_id', $lockedOrder->id)->with('items')->findOrFail($receiptId);

            $materialIds = PurchaseOrderItem::query()
                ->whereIn('id', $receipt->items->pluck('purchase_order_item_id'))
                ->pluck('material_id')
                ->unique()
                ->sort()
                ->values();

            // §31/§71: lock in deterministic ASC id order, never the
            // order the relation/payload happens to yield.
            foreach ($materialIds as $materialId) {
                Material::query()->where('id', $materialId)->lockForUpdate()->first();
            }

            // §32-35: simulate this Receipt's removal for EVERY affected
            // Material before touching a single row — one invalid
            // Material blocks the entire delete.
            foreach ($materialIds as $materialId) {
                if (! $this->ledger->isValidExcludingReceipt($lockedOrder->project_id, $materialId, $receipt->id)) {
                    throw ValidationException::withMessages([
                        'goods_receipt' => 'Este recebimento não pode ser excluído porque existem saídas de material que dependem dele.',
                    ]);
                }
            }

            // §24: items removed explicitly, never a silent cascade.
            $receipt->items()->delete();
            $receipt->delete();

            $lockedOrder->touch();
        });
    }

    /**
     * @param  Collection<int, string>  $itemIds
     * @return Collection<string, string>
     */
    private function receivedTotals(Collection $itemIds): Collection
    {
        if ($itemIds->isEmpty()) {
            return collect();
        }

        return GoodsReceiptItem::query()
            ->whereIn('purchase_order_item_id', $itemIds)
            ->selectRaw('purchase_order_item_id, SUM(quantity) as total')
            ->groupBy('purchase_order_item_id')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->purchase_order_item_id => Quantity::normalize((string) $row->total)]);
    }
}
