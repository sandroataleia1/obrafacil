import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

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

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { confirmPurchaseOrder, deleteGoodsReceipt } from "../purchase-orders-client";
import { PurchaseOrderDetail } from "../purchase-order-detail";
import type { GoodsReceipt, PurchaseOrder, PurchaseOrderItem } from "../types";

function item(overrides: Partial<PurchaseOrderItem> = {}): PurchaseOrderItem {
  return {
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
    ...overrides,
  };
}

function receipt(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  return {
    id: "gr-1",
    received_at: "2026-09-11",
    notes: null,
    items: [{ id: "gri-1", purchase_order_item_id: "item-1", quantity: "5.000" }],
    created_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

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
 * SUPPLY-FRONTEND-01D. Proves (1) the old "Financeiro"/Payable-generation
 * section and its local `hasPayables` guard are fully removed; (2)
 * return-to-draft is hidden once `goods_receipts.length > 0` (real API
 * data); (3) GoodsReceipt DELETE goes straight to the backend — the
 * SUPPLY-FRONTEND-01C1 transitory local chronology precheck is removed
 * now that `GoodsReceiptService::delete()` itself validates against the
 * real (API-persisted) Consumption/Adjustment ledger, and its 422 is
 * shown verbatim; and (4) tenant ownership (TM4/TM7) — a status action
 * or delete that resolves after a Company switch produces zero
 * reload/alert/navigation.
 */
describe("PurchaseOrderDetail — SUPPLY-FRONTEND-01D", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
    reload.mockReset();
    vi.mocked(confirmPurchaseOrder).mockReset();
    vi.mocked(deleteGoodsReceipt).mockReset();
    orderState.order = undefined;
    orderState.error = false;
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
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

  it("TM4: a confirm that resolves after switching Company produces zero reload/alert", async () => {
    orderState.order = order({ commercial_status: "draft" });
    let resolveConfirm!: (value: PurchaseOrder) => void;
    vi.mocked(confirmPurchaseOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderDetail id="po-1" />);

    const button = await screen.findByRole("button", { name: /confirmar pedido/i });
    await user.click(button);

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderDetail id="po-1" />);

    resolveConfirm(order({ commercial_status: "ordered" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reload).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
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
      goods_receipts: [receipt()],
    });
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");
    expect(screen.queryByRole("button", { name: /voltar para rascunho/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/possui recebimentos e não pode voltar para rascunho/i)).toBeInTheDocument();
  });

  it("a Receipt delete calls the backend DELETE API directly and reloads on success", async () => {
    orderState.order = order({
      commercial_status: "ordered",
      items: [item()],
      goods_receipts: [receipt()],
    });
    vi.mocked(deleteGoodsReceipt).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");

    await user.click(screen.getByRole("button", { name: /excluir recebimento/i }));

    await waitFor(() => expect(deleteGoodsReceipt).toHaveBeenCalledWith("po-1", "gr-1"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a 422 chronology error from GoodsReceiptService::delete() is shown verbatim, never a local precheck", async () => {
    orderState.order = order({
      commercial_status: "ordered",
      items: [item()],
      goods_receipts: [receipt()],
    });
    vi.mocked(deleteGoodsReceipt).mockRejectedValue(
      new ApiValidationError(
        {},
        "Este recebimento não pode ser excluído porque existem saídas de material que dependem dele."
      )
    );

    const user = userEvent.setup();
    render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");

    await user.click(screen.getByRole("button", { name: /excluir recebimento/i }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(
        "Este recebimento não pode ser excluído porque existem saídas de material que dependem dele."
      )
    );
  });

  it("TM7: a Receipt delete that resolves after switching Company produces zero reload/alert", async () => {
    orderState.order = order({
      commercial_status: "ordered",
      items: [item()],
      goods_receipts: [receipt()],
    });
    let resolveDelete!: () => void;
    vi.mocked(deleteGoodsReceipt).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderDetail id="po-1" />);
    await screen.findByText("Casa dos Materiais");

    await user.click(screen.getByRole("button", { name: /excluir recebimento/i }));
    await waitFor(() => expect(deleteGoodsReceipt).toHaveBeenCalled());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderDetail id="po-1" />);

    resolveDelete();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reload).not.toHaveBeenCalled();
  });
});
