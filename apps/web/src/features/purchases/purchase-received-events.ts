/**
 * SUPPLY-FRONTEND-01C1 §3. Pure adapter: real API `PurchaseOrder[]`
 * (each already carrying `goods_receipts[].items[]` and `items[]` from
 * `getPurchaseOrder`/`listPurchaseOrderDetailsForProject(s)`) → the flat
 * "physical arrival" event shape `material-consumption.ts`/`stock.ts`
 * need for their ledger math.
 *
 * This REPLACES the removed `goods-receipt-shadow-store.ts` — there is
 * no persistence here, no localStorage, no write-through mirror. Every
 * call derives events fresh from whatever `PurchaseOrder[]` the caller
 * already fetched from the real API for this render/request. A Receipt
 * that exists in Postgres before the browser ever opened, a Receipt
 * created in a different browser/tab, and a Receipt deleted by someone
 * else all resolve correctly and immediately on the next fetch — none
 * of them could ever be true of a local mirror that only updates on
 * this browser's own successful POST/DELETE.
 *
 * One entry per GoodsReceiptItem line. A line whose
 * `purchase_order_item_id` doesn't resolve against `order.items` (should
 * never happen — the backend enforces the FK) is skipped rather than
 * crashing, mirroring the same defensive pattern already used for a
 * "missing" order item elsewhere in this feature.
 */

import { toQuantityUnits } from "@/lib/quantity";
import type { PurchaseOrder } from "./types";

export interface ReceivedEvent {
  goodsReceiptId: string;
  projectId: string;
  materialId: string;
  date: string;
  units: number;
}

export function purchaseOrdersToReceivedEvents(orders: PurchaseOrder[]): ReceivedEvent[] {
  const events: ReceivedEvent[] = [];
  for (const order of orders) {
    for (const receipt of order.goods_receipts) {
      for (const line of receipt.items) {
        const orderItem = order.items.find((item) => item.id === line.purchase_order_item_id);
        if (!orderItem) continue;
        events.push({
          goodsReceiptId: receipt.id,
          projectId: order.project.id,
          materialId: orderItem.material.id,
          date: receipt.received_at,
          units: toQuantityUnits(Number(line.quantity)),
        });
      }
    }
  }
  return events;
}

export function filterReceivedEventsForProjectMaterial(
  receivedEvents: ReceivedEvent[],
  projectId: string,
  materialId: string
): ReceivedEvent[] {
  return receivedEvents.filter((event) => event.projectId === projectId && event.materialId === materialId);
}
