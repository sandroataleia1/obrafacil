<?php

namespace App\Purchases;

use App\Models\GoodsReceiptItem;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Support\Collection;

/**
 * SUPPLY-API-01D §26-28/§61-63. The SINGLE place fulfillment (received/
 * remaining/state) is computed for both Items and Orders — never
 * duplicated in a Resource/StatusService/ItemService/GoodsReceiptService.
 * `fulfillment_status`/`received_quantity`/`remaining_quantity` are always
 * DERIVED from `goods_receipt_items` here, never a persisted column, never
 * accepted from a request (§62).
 *
 * Batch methods (`attachToOrders()`) exist specifically to keep list/detail
 * rendering at zero N+1 (§34/§63): one aggregate query for however many
 * Orders/Items are being rendered, not one query per Item.
 */
class PurchaseOrderFulfillmentService
{
    public const string NOT_RECEIVED = 'not_received';

    public const string PARTIAL = 'partial';

    public const string RECEIVED = 'received';

    /**
     * The received quantity for a SINGLE Item, queried fresh from the DB
     * — used by the guards inside PurchaseOrderItemService/
     * PurchaseOrderStatusService, where exactly one Item/Order is at
     * stake and an extra query is not a meaningful cost.
     */
    public function receivedQuantityForItem(PurchaseOrderItem $item): string
    {
        $sum = GoodsReceiptItem::query()->where('purchase_order_item_id', $item->id)->sum('quantity');

        return Quantity::normalize((string) $sum);
    }

    /**
     * @return array{received_quantity: string, remaining_quantity: string, fulfillment_status: string}
     */
    public function itemFulfillment(PurchaseOrderItem $item, string $receivedQuantity): array
    {
        $ordered = Quantity::normalize((string) $item->quantity);
        $remaining = Quantity::subtract($ordered, $receivedQuantity);

        return [
            'received_quantity' => $receivedQuantity,
            'remaining_quantity' => $remaining,
            'fulfillment_status' => $this->statusFor($receivedQuantity, $ordered),
        ];
    }

    public function statusFor(string $received, string $ordered): string
    {
        if (Quantity::compare($received, '0.000') <= 0) {
            return self::NOT_RECEIVED;
        }

        if (Quantity::compare($received, $ordered) >= 0) {
            return self::RECEIVED;
        }

        return self::PARTIAL;
    }

    /**
     * §61/§63: computes and ATTACHES fulfillment to every Item (as a
     * dynamic, non-persisted `fulfillment` property Resources read from)
     * and to every Order (`fulfillmentStatus`) across a whole collection,
     * using exactly ONE aggregate query regardless of how many
     * Orders/Items are passed — the batch primitive both list and detail
     * rendering share (§28: never summing quantities across different
     * Materials/units — each Item's own ordered/received stay separate,
     * only the resulting STATE strings are compared for the Order-level
     * rollup).
     *
     * @param  iterable<PurchaseOrder>  $orders
     */
    public function attachToOrders(iterable $orders): void
    {
        $orders = $orders instanceof Collection ? $orders : collect($orders);

        $allItemIds = $orders->flatMap(fn (PurchaseOrder $order) => $order->items->pluck('id'));

        $receivedByItemId = $allItemIds->isEmpty()
            ? collect()
            : GoodsReceiptItem::query()
                ->whereIn('purchase_order_item_id', $allItemIds)
                ->selectRaw('purchase_order_item_id, SUM(quantity) as total')
                ->groupBy('purchase_order_item_id')
                ->get()
                ->mapWithKeys(fn ($row) => [$row->purchase_order_item_id => Quantity::normalize((string) $row->total)]);

        foreach ($orders as $order) {
            $statuses = [];

            foreach ($order->items as $item) {
                $received = $receivedByItemId->get($item->id, '0.000');
                $fulfillment = $this->itemFulfillment($item, $received);
                $item->fulfillment = $fulfillment;
                $statuses[] = $fulfillment['fulfillment_status'];
            }

            $order->fulfillmentStatus = $this->rollUp($statuses);
        }
    }

    public function computeAndAttach(PurchaseOrder $order): string
    {
        $this->attachToOrders([$order]);

        return $order->fulfillmentStatus;
    }

    /**
     * @param  array<string>  $itemStatuses
     */
    private function rollUp(array $itemStatuses): string
    {
        if ($itemStatuses === []) {
            return self::NOT_RECEIVED;
        }

        $unique = array_unique($itemStatuses);

        return count($unique) === 1 ? $unique[array_key_first($unique)] : self::PARTIAL;
    }
}
