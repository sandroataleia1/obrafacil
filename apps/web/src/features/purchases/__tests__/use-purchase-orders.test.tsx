import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../purchase-orders-client", () => ({
  listPurchaseOrders: vi.fn(),
}));

import { listPurchaseOrders } from "../purchase-orders-client";
import { usePurchaseOrderList } from "../use-purchase-orders";
import type { PurchaseOrderListItem, PurchaseOrderPaginationResponse } from "../types";

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

function page(data: PurchaseOrderListItem[], currentPage: number, lastPage: number): PurchaseOrderPaginationResponse {
  return {
    data,
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 15, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01C. Server-side pagination/filter hook — tagged by
 * companyId + a fingerprint of every filter dimension (not just page),
 * so a filter change independently fails closed against a still-
 * in-flight request for the previous filter set. `error: true` is never
 * collapsed into an empty list.
 */
describe("usePurchaseOrderList — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    vi.mocked(listPurchaseOrders).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the real paginated response", async () => {
    vi.mocked(listPurchaseOrders).mockResolvedValue(page([listItem("po-1")], 1, 1));
    const { result } = renderHook(() => usePurchaseOrderList({ page: 1 }));
    await waitFor(() => expect(result.current.response).toEqual(page([listItem("po-1")], 1, 1)));
    expect(result.current.error).toBe(false);
  });

  it("a fetch failure sets error:true, response stays undefined (never [])", async () => {
    vi.mocked(listPurchaseOrders).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => usePurchaseOrderList({ page: 1 }));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.response).toBeUndefined();
  });

  it("changing a filter (not just page) triggers a new fetch and discards the stale in-flight one", async () => {
    let resolveDraft!: (value: PurchaseOrderPaginationResponse) => void;
    vi.mocked(listPurchaseOrders)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDraft = resolve;
          })
      )
      .mockResolvedValueOnce(page([listItem("po-ordered")], 1, 1));

    const { result, rerender } = renderHook(({ status }: { status: "draft" | "ordered" }) =>
      usePurchaseOrderList({ page: 1, commercialStatus: status }), { initialProps: { status: "draft" } });

    await waitFor(() => expect(listPurchaseOrders).toHaveBeenCalledTimes(1));

    rerender({ status: "ordered" });
    await waitFor(() => expect(result.current.response).toEqual(page([listItem("po-ordered")], 1, 1)));

    // The late "draft" response must never overwrite the "ordered" result.
    resolveDraft(page([listItem("po-draft")], 1, 1));
    expect(result.current.response).toEqual(page([listItem("po-ordered")], 1, 1));
  });

  it("a stale response for the old Company is discarded after switching", async () => {
    let resolveOld!: (value: PurchaseOrderPaginationResponse) => void;
    vi.mocked(listPurchaseOrders)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce(page([], 1, 1));

    const { result, rerender } = renderHook(() => usePurchaseOrderList({ page: 1 }));
    await waitFor(() => expect(listPurchaseOrders).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveOld(page([listItem("po-1")], 1, 1));

    expect(result.current.response).toBeUndefined();
  });

  it("reload() re-fetches with the same params", async () => {
    vi.mocked(listPurchaseOrders).mockResolvedValueOnce(page([], 1, 1));
    const { result } = renderHook(() => usePurchaseOrderList({ page: 1 }));
    await waitFor(() => expect(result.current.response).toEqual(page([], 1, 1)));

    vi.mocked(listPurchaseOrders).mockResolvedValueOnce(page([listItem("po-1")], 1, 1));
    result.current.reload();
    await waitFor(() => expect(result.current.response).toEqual(page([listItem("po-1")], 1, 1)));
  });
});
