import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../purchase-orders-client", () => ({
  cancelPurchaseOrder: vi.fn(),
  confirmPurchaseOrder: vi.fn(),
  deleteGoodsReceipt: vi.fn(),
  deletePurchaseOrder: vi.fn(),
  deletePurchaseOrderItem: vi.fn(),
  returnPurchaseOrderToDraft: vi.fn(),
}));

const orderState: { order: unknown; error: boolean } = { order: undefined, error: false };
const reload = vi.fn();
vi.mock("../use-purchase-order", () => ({
  usePurchaseOrder: () => ({ order: orderState.order, error: orderState.error, reload }),
}));

vi.mock("../prototype/goods-receipt-shadow-store", () => ({
  removeGoodsReceiptShadowEntriesForReceipt: vi.fn(),
}));

import { ApiError } from "@/lib/api-client";
import { confirmPurchaseOrder } from "../purchase-orders-client";
import { PurchaseOrderDetail } from "../purchase-order-detail";
import type { PurchaseOrder } from "../types";

function order(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
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
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01C. Proves (1) the old "Financeiro"/Payable-generation
 * section and its local `hasPayables` guard are fully removed — the
 * backend does not implement a PurchaseOrder→Payable integration, so a
 * real 409 on any status action shows the exact controlled notice and
 * refetches truth, never a silent retry; and (2) return-to-draft is
 * hidden once `goods_receipts.length > 0` (real API data), not any local
 * Payable check.
 */
describe("PurchaseOrderDetail — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    push.mockReset();
    reload.mockReset();
    vi.mocked(confirmPurchaseOrder).mockReset();
    orderState.order = undefined;
    orderState.error = false;
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("alert", vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("never renders a Financeiro section or a 'Gerar conta a pagar' action", async () => {
    orderState.order = order({ commercial_status: "ordered" });
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");

    expect(screen.queryByText(/financeiro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gerar conta a pagar/i)).not.toBeInTheDocument();
  });

  it("a 409 on confirm shows the controlled conflict notice and refetches, never a silent retry", async () => {
    orderState.order = order({ commercial_status: "draft" });
    vi.mocked(confirmPurchaseOrder).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<PurchaseOrderDetail id="po-1" />);

    const button = await screen.findByRole("button", { name: /confirmar pedido/i });
    await user.click(button);

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith("A compra foi alterada por outra operação. Os dados foram atualizados.")
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(confirmPurchaseOrder).toHaveBeenCalledTimes(1);
  });

  it("return-to-draft is offered for an 'ordered' order with zero goods receipts", async () => {
    orderState.order = order({ commercial_status: "ordered", goods_receipts: [] });
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");
    expect(await screen.findByRole("button", { name: /voltar para rascunho/i })).toBeInTheDocument();
  });

  it("return-to-draft is hidden once the order has a real goods receipt (API data, not a local Payable check)", async () => {
    orderState.order = order({
      commercial_status: "ordered",
      goods_receipts: [{ id: "gr-1", received_at: "2026-09-11", notes: null, items: [], created_at: "2026-09-11T00:00:00Z" }],
    });
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");
    expect(screen.queryByRole("button", { name: /voltar para rascunho/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/possui recebimentos e não pode voltar para rascunho/i)).toBeInTheDocument();
  });
});
