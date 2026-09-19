<?php

namespace App\Purchases;

use App\Enums\PurchaseOrderCommercialStatus;
use App\Models\Material;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Purchases\Exceptions\PurchaseOrderConcurrencyConflictException;
use App\Purchases\Exceptions\PurchaseOrderStatusConflictException;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SUPPLY-API-01C §28-34/§45/§52. Every method locks the PARENT
 * PurchaseOrder first (PurchaseOrderLocker) — this is what makes
 * "confirm vs delete-last-item" (§46) race-safe, and what lets `touch()`
 * on the locked parent (§52) reliably advance its `updated_at` whenever
 * an item is added/updated/deleted.
 *
 * §31/DOMAIN-UNIQUE-SAVEPOINT-01: `addItem()`'s entire body — including
 * the INSERT that can trigger `purchase_order_items_order_material_unique`
 * — runs inside one `DB::transaction()`, so a caught 23505 never poisons
 * an outer transaction.
 *
 * SUPPLY-API-01D §35-40: since GoodsReceiptService ALSO locks the parent
 * Order first (§14/§58), every guard here that reads a received quantity
 * (`PurchaseOrderFulfillmentService::receivedQuantityForItem()`) is
 * automatically race-safe against a concurrent GoodsReceipt create for
 * the same Item — both serialize on the same PurchaseOrder row lock
 * (§41/§42).
 */
class PurchaseOrderItemService
{
    private const string ORDER_MATERIAL_UNIQUE_CONSTRAINT = 'purchase_order_items_order_material_unique';

    public function __construct(
        private readonly PurchaseOrderLocker $locker,
        private readonly PurchaseOrderFulfillmentService $fulfillmentService,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function addItem(PurchaseOrder|string $purchaseOrder, array $validated): PurchaseOrderItem
    {
        try {
            return DB::transaction(function () use ($purchaseOrder, $validated) {
                $lockedOrder = $this->locker->lock($purchaseOrder);
                $this->assertItemsMutable($lockedOrder);
                $this->assertOrderNotFullyReceived($lockedOrder);

                // §44: locked (not a plain find()) so a concurrent
                // MaterialService::delete() for this same Material
                // serializes against this create().
                $material = Material::query()->lockForUpdate()->find($validated['material_id']);

                if ($material === null) {
                    throw ValidationException::withMessages(['material_id' => 'Material inválido.']);
                }

                if (! $material->active) {
                    throw ValidationException::withMessages(['material_id' => 'Este material está inativo.']);
                }

                $unitPrice = Money::normalize((string) $validated['unit_price']);
                $this->assertUnitPriceValidForStatus($lockedOrder, $unitPrice);

                $item = PurchaseOrderItem::create([
                    'purchase_order_id' => $lockedOrder->id,
                    'material_id' => $material->id,
                    'description' => $validated['description'],
                    // §8: snapshot copied server-side from the Material —
                    // never from the request payload.
                    'unit_code' => $material->unit_code,
                    'unit_custom_label' => $material->unit_custom_label,
                    'quantity' => $validated['quantity'],
                    'unit_price' => $unitPrice,
                ]);

                $lockedOrder->touch();

                return $item;
            });
        } catch (QueryException $e) {
            $this->rethrowAsValidationIfDuplicate($e);

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function updateItem(PurchaseOrder|string $purchaseOrder, PurchaseOrderItem|string $item, array $validated): PurchaseOrderItem
    {
        return DB::transaction(function () use ($purchaseOrder, $item, $validated) {
            $lockedOrder = $this->locker->lock($purchaseOrder);
            $this->assertItemsMutable($lockedOrder);

            $itemId = $item instanceof PurchaseOrderItem ? $item->id : $item;
            $lockedItem = $lockedOrder->items()->whereKey($itemId)->firstOrFail();

            $this->assertItemNotStale($lockedItem, $validated['updated_at']);

            $unitPrice = Money::normalize((string) $validated['unit_price']);
            $this->assertUnitPriceValidForStatus($lockedOrder, $unitPrice);

            // §36/§62: the received total is always read fresh from the
            // DB inside this same lock — never accepted from the request.
            $receivedQuantity = $this->fulfillmentService->receivedQuantityForItem($lockedItem);
            $newQuantity = Quantity::normalize((string) $validated['quantity']);
            $this->assertQuantityChangeAllowed($lockedItem, $receivedQuantity, $newQuantity);

            $lockedItem->fill([
                'description' => $validated['description'],
                'quantity' => $newQuantity,
                'unit_price' => $unitPrice,
            ]);
            $lockedItem->save();

            $lockedOrder->touch();

            return $lockedItem->fresh();
        });
    }

    public function deleteItem(PurchaseOrder|string $purchaseOrder, PurchaseOrderItem|string $item): void
    {
        DB::transaction(function () use ($purchaseOrder, $item) {
            $lockedOrder = $this->locker->lock($purchaseOrder);
            $this->assertItemsMutable($lockedOrder);

            $itemId = $item instanceof PurchaseOrderItem ? $item->id : $item;
            $lockedItem = $lockedOrder->items()->whereKey($itemId)->firstOrFail();

            // SUPPLY-API-01D §40/§42: an Item with any physical receipt
            // can never be deleted — checked fresh from the DB, inside
            // the same Order lock a concurrent GoodsReceipt create also
            // takes, so the two can never race to a corrupt outcome.
            $receivedQuantity = $this->fulfillmentService->receivedQuantityForItem($lockedItem);
            if (Quantity::compare($receivedQuantity, '0.000') > 0) {
                throw ValidationException::withMessages([
                    'item' => 'Este item já possui material recebido.',
                ]);
            }

            // §33/§46: an ordered Order must never end up with zero items
            // — this check runs against the count taken AFTER the parent
            // lock is held, so it can never race a concurrent confirm()/
            // another delete() for the same Order.
            if ($lockedOrder->commercial_status === PurchaseOrderCommercialStatus::Ordered) {
                $remaining = $lockedOrder->items()->count();

                if ($remaining <= 1) {
                    throw new PurchaseOrderStatusConflictException(
                        'Um pedido confirmado precisa manter ao menos um item.'
                    );
                }
            }

            $lockedItem->delete();
            $lockedOrder->touch();
        });
    }

    /**
     * §14/§27/§30: cancelled blocks add/update/delete entirely — draft and
     * ordered both allow item mutation (with their own price rule, see
     * assertUnitPriceValidForStatus()).
     */
    private function assertItemsMutable(PurchaseOrder $order): void
    {
        if ($order->commercial_status === PurchaseOrderCommercialStatus::Cancelled) {
            throw new PurchaseOrderStatusConflictException(
                'Este pedido está cancelado e seus itens não podem ser alterados.'
            );
        }
    }

    /**
     * SUPPLY-API-01D §35: a fully-received `ordered` Order accepts no new
     * items — draft is unaffected (fulfillment is meaningless before
     * confirmation), and cancelled is already blocked by
     * assertItemsMutable().
     */
    private function assertOrderNotFullyReceived(PurchaseOrder $order): void
    {
        if ($order->commercial_status !== PurchaseOrderCommercialStatus::Ordered) {
            return;
        }

        $order->loadMissing('items');
        $status = $this->fulfillmentService->computeAndAttach($order);

        if ($status === PurchaseOrderFulfillmentService::RECEIVED) {
            throw new PurchaseOrderStatusConflictException(
                'Este pedido já foi totalmente recebido e não aceita novos itens.'
            );
        }
    }

    /**
     * SUPPLY-API-01D §37-39: encodes the three possible receipt states
     * for a single Item's quantity edit —
     *   - zero received: free to change to anything > 0 (§39, already
     *     enforced by the FormRequest's own gt:0 rule).
     *   - partially received: may rise freely, may fall no lower than
     *     what's already been physically received (§38).
     *   - fully received: frozen — the new value must equal the current
     *     one exactly, neither direction (§37).
     */
    private function assertQuantityChangeAllowed(PurchaseOrderItem $item, string $receivedQuantity, string $newQuantity): void
    {
        if (Quantity::compare($receivedQuantity, '0.000') <= 0) {
            return;
        }

        $orderedQuantity = Quantity::normalize((string) $item->quantity);

        if (Quantity::compare($receivedQuantity, $orderedQuantity) >= 0) {
            if (Quantity::compare($newQuantity, $orderedQuantity) !== 0) {
                throw ValidationException::withMessages([
                    'quantity' => 'Este item já foi totalmente recebido e sua quantidade não pode ser alterada.',
                ]);
            }

            return;
        }

        if (Quantity::compare($newQuantity, $receivedQuantity) < 0) {
            throw ValidationException::withMessages([
                'quantity' => 'A quantidade não pode ser menor que o total já recebido para este item.',
            ]);
        }
    }

    /**
     * §11/§15/§30: draft allows unit_price >= 0 (already enforced by the
     * DB CHECK/FormRequest); ordered additionally requires > 0.
     */
    private function assertUnitPriceValidForStatus(PurchaseOrder $order, string $unitPrice): void
    {
        if ($order->commercial_status === PurchaseOrderCommercialStatus::Ordered && Money::compare($unitPrice, '0') <= 0) {
            throw ValidationException::withMessages([
                'unit_price' => 'O preço unitário precisa ser maior que zero em um pedido confirmado.',
            ]);
        }
    }

    private function assertItemNotStale(PurchaseOrderItem $item, string $providedUpdatedAt): void
    {
        $provided = Carbon::parse($providedUpdatedAt);

        if ($item->updated_at === null || ! $item->updated_at->equalTo($provided)) {
            throw new PurchaseOrderConcurrencyConflictException(
                'Este item foi alterado por outra pessoa. Recarregue os dados e tente novamente.'
            );
        }
    }

    private function rethrowAsValidationIfDuplicate(QueryException $e): void
    {
        if ($e->getCode() !== '23505') {
            return;
        }

        if (! str_contains($e->getMessage(), self::ORDER_MATERIAL_UNIQUE_CONSTRAINT)) {
            return;
        }

        throw ValidationException::withMessages([
            'material_id' => 'Este material já foi adicionado a este pedido.',
        ]);
    }
}
