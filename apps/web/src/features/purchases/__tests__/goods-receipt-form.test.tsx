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
  createGoodsReceipt: vi.fn(),
}));

const orderState: { order: unknown; error: boolean } = { order: undefined, error: false };
const reload = vi.fn();
vi.mock("../use-purchase-order", () => ({
  usePurchaseOrder: () => ({ order: orderState.order, error: orderState.error, reload }),
}));

import { createGoodsReceipt } from "../purchase-orders-client";
import { GoodsReceiptForm } from "../goods-receipt-form";
import type { PurchaseOrder, PurchaseOrderItem } from "../types";

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
    received_quantity: "0.000",
    remaining_quantity: "10.000",
    fulfillment_status: "not_received",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function order(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    number: "PC-000001",
    commercial_status: "ordered",
    fulfillment_status: "not_received",
    supplier: { id: "sup-1", name: "Casa dos Materiais", active: true },
    project: { id: "proj-1", number: "OBR-000001", name: "Casa Oliveira" },
    order_date: "2026-09-10",
    expected_delivery_date: null,
    notes: null,
    items: [item()],
    goods_receipts: [],
    total: "250.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01C1 §12/§18/TM10. Order must be `ordered`; pending
 * items come from `item.remaining_quantity > 0`; at least 1 filled line
 * is required; a successful POST writes NOTHING to localStorage (zero
 * shadow, zero mirror) and navigates back to the order detail
 * (re-reading API truth). A POST that resolves after a Company switch
 * produces zero navigation.
 */
describe("GoodsReceiptForm — SUPPLY-FRONTEND-01C1", () => {
  beforeEach(() => {
    push.mockReset();
    reload.mockReset();
    vi.mocked(createGoodsReceipt).mockReset();
    orderState.order = undefined;
    orderState.error = false;
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a draft order (not yet ordered) never shows the receipt form", () => {
    orderState.order = order({ commercial_status: "draft" });
    render(<GoodsReceiptForm purchaseOrderId="po-1" />);
    expect(screen.queryByText(/registrar recebimento/i)).not.toBeInTheDocument();
  });

  it("shows only items with remaining_quantity > 0", async () => {
    orderState.order = order({
      items: [
        item({ id: "item-1", description: "Pendente", remaining_quantity: "5.000" }),
        item({ id: "item-2", description: "Totalmente recebido", remaining_quantity: "0.000" }),
      ],
    });
    render(<GoodsReceiptForm purchaseOrderId="po-1" />);
    expect(await screen.findByText("Pendente")).toBeInTheDocument();
    expect(screen.queryByText("Totalmente recebido")).not.toBeInTheDocument();
  });

  it("submitting with zero filled lines shows the min-1-line error and never calls the API", async () => {
    orderState.order = order();
    const user = userEvent.setup();
    render(<GoodsReceiptForm purchaseOrderId="po-1" />);

    const button = await screen.findByRole("button", { name: /registrar recebimento/i });
    await user.click(button);

    expect(await screen.findByText(/preencha ao menos um item recebido/i)).toBeInTheDocument();
    expect(createGoodsReceipt).not.toHaveBeenCalled();
  });

  it("SH10: a successful submit writes zero localStorage of any kind and navigates to the order detail (re-reading API truth)", async () => {
    orderState.order = order();
    vi.mocked(createGoodsReceipt).mockResolvedValue({
      id: "gr-1",
      received_at: "2026-09-12",
      notes: null,
      items: [{ id: "gri-1", purchase_order_item_id: "item-1", quantity: "5.000" }],
      created_at: "2026-09-12T00:00:00Z",
    });

    const setItemSpy = vi.spyOn(window.localStorage.__proto__, "setItem");

    const user = userEvent.setup();
    render(<GoodsReceiptForm purchaseOrderId="po-1" />);

    const quantityInput = await screen.findByPlaceholderText("0");
    await user.type(quantityInput, "5");
    await user.click(screen.getByRole("button", { name: /registrar recebimento/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/compras/po-1"));

    expect(createGoodsReceipt).toHaveBeenCalledWith("po-1", {
      received_at: expect.any(String),
      notes: null,
      items: [{ purchase_order_item_id: "item-1", quantity: "5" }],
    });
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("TM10: a Receipt POST that resolves after switching Company produces zero navigation", async () => {
    orderState.order = order();
    let resolveCreate!: (value: Awaited<ReturnType<typeof createGoodsReceipt>>) => void;
    vi.mocked(createGoodsReceipt).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<GoodsReceiptForm purchaseOrderId="po-1" />);

    const quantityInput = await screen.findByPlaceholderText("0");
    await user.type(quantityInput, "5");
    await user.click(screen.getByRole("button", { name: /registrar recebimento/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<GoodsReceiptForm purchaseOrderId="po-1" />);

    resolveCreate({
      id: "gr-1",
      received_at: "2026-09-12",
      notes: null,
      items: [{ id: "gri-1", purchase_order_item_id: "item-1", quantity: "5.000" }],
      created_at: "2026-09-12T00:00:00Z",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(push).not.toHaveBeenCalled();
  });
});
