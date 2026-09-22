import { describe, expect, it } from "vitest";

import { purchaseOrdersToReceivedEvents, filterReceivedEventsForProjectMaterial } from "../purchase-received-events";
import type { PurchaseOrder } from "../types";

function order(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    number: "PC-000001",
    commercial_status: "ordered",
    fulfillment_status: "partial",
    supplier: { id: "sup-1", name: "Casa dos Materiais", active: true },
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    order_date: "2026-09-10",
    expected_delivery_date: null,
    notes: null,
    items: [
      {
        id: "item-1",
        material: { id: "mat-1", name: "Cimento", active: true },
        description: "Cimento CP-II",
        unit_code: "sc",
        unit_custom_label: null,
        quantity: "10.000",
        unit_price: "25.00",
        line_total: "250.00",
        received_quantity: "5.000",
        remaining_quantity: "5.000",
        fulfillment_status: "partial",
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
      },
    ],
    goods_receipts: [
      {
        id: "gr-1",
        received_at: "2026-09-11",
        notes: null,
        items: [{ id: "gri-1", purchase_order_item_id: "item-1", quantity: "5.000" }],
        created_at: "2026-09-11T00:00:00Z",
      },
    ],
    total: "250.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01C1 §2/§3 (SH3-SH6-equivalent, pure adapter level).
 * ROOT-CAUSE PROOF that the old `goods-receipt-shadow-store.ts` was
 * incorrect: it only ever knew about a Receipt AFTER this browser's own
 * successful POST wrote it. This adapter instead derives events fresh
 * from whatever `PurchaseOrder[]` the caller already fetched from the
 * real API — so a Receipt that existed before this browser opened, one
 * created in a different browser/tab, and one removed elsewhere all
 * resolve correctly on the very next fetch, with ZERO local write ever
 * involved.
 */
describe("purchase-received-events — SUPPLY-FRONTEND-01C1", () => {
  it("SH3: a Receipt that already existed in the API before this browser ever opened is derived correctly — no prior local write required", () => {
    // This order/receipt was never touched by this browser (no POST was
    // ever made here) — it simply arrived pre-populated from a
    // `listPurchaseOrderDetailsForProject` fetch, exactly as it would
    // on first page load after a Receipt was created by someone else,
    // in the past, before this session existed.
    const events = purchaseOrdersToReceivedEvents([order()]);
    expect(events).toEqual([
      { goodsReceiptId: "gr-1", projectId: "proj-1", materialId: "mat-1", date: "2026-09-11", units: 5000 },
    ]);
  });

  it("SH4: a Receipt from an order fetched fresh forms a real Project+Material pair for Stock position discovery", () => {
    const events = purchaseOrdersToReceivedEvents([order()]);
    const pairs = new Set(events.map((event) => `${event.projectId}::${event.materialId}`));
    expect(pairs.has("proj-1::mat-1")).toBe(true);
  });

  it("SH6: a Receipt created in a different browser/tab (i.e. simply present in the next API fetch) is derived identically to one created locally", () => {
    // Simulates re-fetching the API after some OTHER browser/tab created
    // this exact Receipt — from this adapter's perspective there is no
    // difference: it only ever reads the fetched PurchaseOrder[], never
    // "who" created the Receipt or "which browser" POSTed it.
    const refetchedOrder = order({
      goods_receipts: [
        {
          id: "gr-2",
          received_at: "2026-09-13",
          notes: "Criado em outra aba",
          items: [{ id: "gri-2", purchase_order_item_id: "item-1", quantity: "3.000" }],
          created_at: "2026-09-13T00:00:00Z",
        },
      ],
    });
    const events = purchaseOrdersToReceivedEvents([refetchedOrder]);
    expect(events).toEqual([
      { goodsReceiptId: "gr-2", projectId: "proj-1", materialId: "mat-1", date: "2026-09-13", units: 3000 },
    ]);
  });

  it("SH5: a Receipt removed elsewhere (absent from the next API fetch) simply produces zero events for it — no stale entry lingers", () => {
    // The "next fetch" simply doesn't include the deleted Receipt in
    // `goods_receipts` anymore — there is no mirror to clean up.
    const afterRemoteDelete = order({ goods_receipts: [] });
    const events = purchaseOrdersToReceivedEvents([afterRemoteDelete]);
    expect(events).toEqual([]);
  });

  it("a receipt line whose purchase_order_item_id doesn't resolve against order.items is skipped, never crashes", () => {
    const withOrphanLine = order({
      goods_receipts: [
        {
          id: "gr-3",
          received_at: "2026-09-14",
          notes: null,
          items: [{ id: "gri-3", purchase_order_item_id: "missing-item", quantity: "1.000" }],
          created_at: "2026-09-14T00:00:00Z",
        },
      ],
    });
    expect(purchaseOrdersToReceivedEvents([withOrphanLine])).toEqual([]);
  });

  it("filterReceivedEventsForProjectMaterial scopes to exactly one Project+Material pair", () => {
    const events = purchaseOrdersToReceivedEvents([
      order(),
      order({
        id: "po-2",
        project: { id: "proj-2", number: "OBR-000002", name: "Outra Obra" },
        goods_receipts: [
          {
            id: "gr-4",
            received_at: "2026-09-15",
            notes: null,
            items: [{ id: "gri-4", purchase_order_item_id: "item-1", quantity: "2.000" }],
            created_at: "2026-09-15T00:00:00Z",
          },
        ],
      }),
    ]);
    expect(filterReceivedEventsForProjectMaterial(events, "proj-1", "mat-1")).toEqual([
      { goodsReceiptId: "gr-1", projectId: "proj-1", materialId: "mat-1", date: "2026-09-11", units: 5000 },
    ]);
  });
});
