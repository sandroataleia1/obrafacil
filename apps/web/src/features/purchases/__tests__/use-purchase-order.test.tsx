import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../purchase-orders-client", () => ({
  getPurchaseOrder: vi.fn(),
}));

import { getPurchaseOrder } from "../purchase-orders-client";
import { usePurchaseOrder } from "../use-purchase-order";
import type { PurchaseOrder } from "../types";

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

/**
 * SUPPLY-FRONTEND-01C. 404 vs. network error must never collapse into
 * the same state (`catch => null` is forbidden) — mirrors
 * `useMaterialRequirement`'s RH8/RH9.
 */
describe("usePurchaseOrder — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    vi.mocked(getPurchaseOrder).mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a real 404 resolves order to null, error stays false", async () => {
    vi.mocked(getPurchaseOrder).mockRejectedValue(new ApiError(404, "Not Found"));
    const { result } = renderHook(() => usePurchaseOrder("po-1"));
    await waitFor(() => expect(result.current.order).toBeNull());
    expect(result.current.error).toBe(false);
  });

  it("a 500/network failure sets error:true, order stays undefined (never null)", async () => {
    vi.mocked(getPurchaseOrder).mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => usePurchaseOrder("po-1"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.order).toBeUndefined();
  });

  it("a successful load resolves the real PurchaseOrder", async () => {
    vi.mocked(getPurchaseOrder).mockResolvedValue(order("po-1"));
    const { result } = renderHook(() => usePurchaseOrder("po-1"));
    await waitFor(() => expect(result.current.order).toEqual(order("po-1")));
  });

  it("a stale response for the old Company is discarded after switching", async () => {
    let resolveOld!: (value: PurchaseOrder) => void;
    vi.mocked(getPurchaseOrder)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce(order("po-2"));

    const { result, rerender } = renderHook(() => usePurchaseOrder("po-1"));
    await waitFor(() => expect(getPurchaseOrder).toHaveBeenCalledTimes(1));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender();
    resolveOld(order("po-1"));

    expect(result.current.order).toBeUndefined();
  });

  it("reload() re-fetches and clears a previous error on success", async () => {
    vi.mocked(getPurchaseOrder).mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => usePurchaseOrder("po-1"));
    await waitFor(() => expect(result.current.error).toBe(true));

    vi.mocked(getPurchaseOrder).mockResolvedValueOnce(order("po-1"));
    result.current.reload();
    await waitFor(() => expect(result.current.order).toEqual(order("po-1")));
    expect(result.current.error).toBe(false);
  });
});
