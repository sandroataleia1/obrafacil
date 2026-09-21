import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("../purchase-orders-client", () => ({
  createGoodsReceipt: vi.fn(),
}));

const orderState: { order: unknown; error: boolean } = { order: undefined, error: false };
const reload = vi.fn();
vi.mock("../use-purchase-order", () => ({
  usePurchaseOrder: () => ({ order: orderState.order, error: orderState.error, reload }),
}));

vi.mock("../prototype/goods-receipt-shadow-store", () => ({
  saveGoodsReceiptShadowEntries: vi.fn(),
}));

import { createGoodsReceipt } from "../purchase-orders-client";
import { saveGoodsReceiptShadowEntries as saveShadowEntries } from "../prototype/goods-receipt-shadow-store";
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
 * SUPPLY-FRONTEND-01C. Order must be `ordered`; pending items come from
 * `item.remaining_quantity > 0`; at least 1 filled line is required; a
 * successful POST writes through to the local shadow store (never
 * inserts the created GoodsReceipt into any Purchase-side local store)
 * and navigates back to the order detail (re-reading API truth).
 */
describe("GoodsReceiptForm — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    push.mockReset();
    reload.mockReset();
    vi.mocked(saveShadowEntries).mockReset();
    vi.mocked(createGoodsReceipt).mockReset();
    orderState.order = undefined;
    orderState.error = false;
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

  it("a successful submit sends only positive filled lines, writes the shadow store, and navigates to the order detail", async () => {
    orderState.order = order();
    vi.mocked(createGoodsReceipt).mockResolvedValue({
      id: "gr-1",
      received_at: "2026-09-12",
      notes: null,
      items: [{ id: "gri-1", purchase_order_item_id: "item-1", quantity: "5.000" }],
      created_at: "2026-09-12T00:00:00Z",
    });

    const user = userEvent.setup();
    render(<GoodsReceiptForm purchaseOrderId="po-1" />);

    const quantityInput = await screen.findByPlaceholderText("0");
    await user.type(quantityInput, "5");
    await user.click(screen.getByRole("button", { name: /registrar recebimento/i }));

    expect(createGoodsReceipt).toHaveBeenCalledWith("po-1", {
      received_at: expect.any(String),
      notes: null,
      items: [{ purchase_order_item_id: "item-1", quantity: "5" }],
    });
    expect(saveShadowEntries).toHaveBeenCalledWith([
      {
        id: "gri-1",
        goodsReceiptId: "gr-1",
        projectId: "proj-1",
        materialId: "mat-1",
        receivedAt: "2026-09-12",
        quantity: 5,
      },
    ]);
    expect(push).toHaveBeenCalledWith("/compras/po-1");
  });
});
