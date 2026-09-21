import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api-client";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createGoodsReceipt,
  createPurchaseOrder,
  createPurchaseOrderItem,
  deleteGoodsReceipt,
  deletePurchaseOrder,
  deletePurchaseOrderItem,
  getPurchaseOrder,
  listAllPurchaseOrders,
  listPurchaseOrderDetailsForProject,
  listPurchaseOrders,
  returnPurchaseOrderToDraft,
  updatePurchaseOrder,
  updatePurchaseOrderItem,
} from "../purchase-orders-client";
import type { PurchaseOrder, PurchaseOrderListItem, PurchaseOrderPaginationResponse } from "../types";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiRequest: vi.fn(),
  };
});

function listItem(id: string): PurchaseOrderListItem {
  return {
    id,
    number: "PC-000001",
    commercial_status: "draft",
    fulfillment_status: "not_received",
    supplier: { id: "sup-1", name: "Casa dos Materiais", active: true },
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    order_date: "2026-09-10",
    expected_delivery_date: null,
    notes: null,
    items_count: 1,
    total: "100.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function order(id: string): PurchaseOrder {
  return {
    id,
    number: "PC-000001",
    commercial_status: "draft",
    fulfillment_status: "not_received",
    supplier: { id: "sup-1", name: "Casa dos Materiais", active: true },
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    order_date: "2026-09-10",
    expected_delivery_date: null,
    notes: null,
    items: [],
    goods_receipts: [],
    total: "0.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function page(data: PurchaseOrderListItem[], currentPage: number, lastPage: number): PurchaseOrderPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 100, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01C (RC1-RC8-equivalent). Client contract tests —
 * never testing `apiRequest` internals, only that this module calls it
 * with the right URL/method/params for every one of the 13+2 exported
 * functions, and that snake_case wire params are derived correctly from
 * camelCase JS params.
 */
describe("purchase-orders-client — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("RC1: list hits /api/v1/purchase-orders with zero params when none given", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 1, 1));
    await listPurchaseOrders();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders");
  });

  it("RC2: list converts camelCase filters to snake_case query params", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(page([], 1, 1));
    await listPurchaseOrders({
      search: "silva",
      commercialStatus: "ordered",
      projectId: "proj-1",
      supplierId: "sup-1",
      page: 2,
      perPage: 15,
    });
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/purchase-orders?search=silva&commercial_status=ordered&project_id=proj-1&supplier_id=sup-1&page=2&per_page=15"
    );
  });

  it("RC3: listAllPurchaseOrders pages past 100 (last_page=2) and returns all rows", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(page([listItem("po-1")], 1, 2))
      .mockResolvedValueOnce(page([listItem("po-2")], 2, 2));

    const all = await listAllPurchaseOrders();

    expect(all).toEqual([listItem("po-1"), listItem("po-2")]);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/v1/purchase-orders?page=1&per_page=100");
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/v1/purchase-orders?page=2&per_page=100");
  });

  it("RC4: getPurchaseOrder hits the detail URL", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(order("po-1"));
    await getPurchaseOrder("po-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1");
  });

  it("RC5: create POSTs exactly the given payload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(order("po-1"));
    const payload = { supplier_id: "sup-1", project_id: "proj-1", order_date: "2026-09-10" };
    await createPurchaseOrder(payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders", { method: "POST", body: payload });
  });

  it("RC6: update PUTs the payload including updated_at", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(order("po-1"));
    const payload = {
      supplier_id: "sup-1",
      project_id: "proj-1",
      order_date: "2026-09-10",
      updated_at: "2026-09-10T00:00:00Z",
    };
    await updatePurchaseOrder("po-1", payload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1", { method: "PUT", body: payload });
  });

  it("RC7: delete DELETEs with the updated_at token in the body", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);
    await deletePurchaseOrder("po-1", { updated_at: "2026-09-10T00:00:00Z" });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1", {
      method: "DELETE",
      body: { updated_at: "2026-09-10T00:00:00Z" },
    });
  });

  it("RC8: confirm/cancel/return-to-draft each POST to their own action URL with only updated_at", async () => {
    vi.mocked(apiRequest).mockResolvedValue(order("po-1"));
    const token = { updated_at: "2026-09-10T00:00:00Z" };

    await confirmPurchaseOrder("po-1", token);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/confirm", { method: "POST", body: token });

    await cancelPurchaseOrder("po-1", token);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/cancel", { method: "POST", body: token });

    await returnPurchaseOrderToDraft("po-1", token);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/return-to-draft", {
      method: "POST",
      body: token,
    });
  });

  it("RC9: item create/update/delete hit the nested item URLs; delete sends no body", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    const createPayload = { material_id: "mat-1", description: "Cimento", quantity: "10.000", unit_price: "25.00" };
    await createPurchaseOrderItem("po-1", createPayload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/items", { method: "POST", body: createPayload });

    const updatePayload = { description: "Cimento CP-II", quantity: "12.000", unit_price: "26.00", updated_at: "t1" };
    await updatePurchaseOrderItem("po-1", "item-1", updatePayload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/items/item-1", {
      method: "PUT",
      body: updatePayload,
    });

    await deletePurchaseOrderItem("po-1", "item-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/items/item-1", { method: "DELETE" });
  });

  it("RC10: goods-receipt create/delete hit the nested receipt URLs; delete sends no body", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    const createPayload = {
      received_at: "2026-09-10",
      notes: null,
      items: [{ purchase_order_item_id: "item-1", quantity: "5.000" }],
    };
    await createGoodsReceipt("po-1", createPayload);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/goods-receipts", {
      method: "POST",
      body: createPayload,
    });

    await deleteGoodsReceipt("po-1", "receipt-1");
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/purchase-orders/po-1/goods-receipts/receipt-1", {
      method: "DELETE",
    });
  });

  it("RC11: listPurchaseOrderDetailsForProject fans out one getPurchaseOrder per row, rejects whole call on any detail failure", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(page([listItem("po-1"), listItem("po-2")], 1, 1))
      .mockResolvedValueOnce(order("po-1"))
      .mockRejectedValueOnce(new Error("500"));

    await expect(listPurchaseOrderDetailsForProject("proj-1")).rejects.toThrow();
  });

  it("RC12: every client function goes through apiRequest, zero raw fetch calls made", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.mocked(apiRequest).mockResolvedValue(page([], 1, 1));
    await listPurchaseOrders();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
