import { render, screen } from "@testing-library/react";
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
  createPurchaseOrderItem: vi.fn(),
  updatePurchaseOrderItem: vi.fn(),
}));

const orderState: { order: unknown; error: boolean } = { order: undefined, error: false };
vi.mock("../use-purchase-order", () => ({
  usePurchaseOrder: () => ({ order: orderState.order, error: orderState.error, reload: vi.fn() }),
}));

const materialsState: { materials: unknown[] | undefined } = { materials: [] };
vi.mock("@/features/materials/use-all-materials", () => ({
  useAllMaterials: () => ({ materials: materialsState.materials, error: false, reload: vi.fn() }),
}));

import { createPurchaseOrderItem, updatePurchaseOrderItem } from "../purchase-orders-client";
import { PurchaseOrderItemForm } from "../purchase-order-item-form";
import type { PurchaseOrder, PurchaseOrderItem } from "../types";
import type { MaterialListItem } from "@/features/materials/types";

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
    commercial_status: "draft",
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

function material(id: string, name: string): MaterialListItem {
  return { id, name, unit_code: "sc", unit_custom_label: null, active: true, updated_at: "2026-09-10T00:00:00Z" };
}

/**
 * SUPPLY-FRONTEND-01C. Create excludes already-used material ids (the
 * item already on `order.items`); edit shows Material fixed and
 * displays unit via the item's OWN snapshot `unit_code`/
 * `unit_custom_label` — never a live Material lookup; there is no
 * standalone GET-item endpoint, so edit resolves purely from
 * `order.items.find(...)`.
 */
describe("PurchaseOrderItemForm — SUPPLY-FRONTEND-01C", () => {
  beforeEach(() => {
    push.mockReset();
    orderState.order = undefined;
    orderState.error = false;
    materialsState.materials = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("create excludes a Material already used by another item on this order", async () => {
    orderState.order = order({ items: [item({ material: { id: "mat-1", name: "Cimento", active: true } })] });
    materialsState.materials = [material("mat-1", "Cimento"), material("mat-2", "Areia")];
    const user = userEvent.setup();
    render(<PurchaseOrderItemForm purchaseOrderId="po-1" />);

    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);

    expect(await screen.findByRole("option", { name: "Areia" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cimento" })).not.toBeInTheDocument();
  });

  it("edit shows the Material fixed (not a selector) and the item's own unit snapshot, resolved from order.items", async () => {
    orderState.order = order({
      items: [
        item({
          id: "item-1",
          material: { id: "mat-1", name: "Cimento", active: true },
          unit_code: "kg",
          unit_custom_label: null,
        }),
      ],
    });
    render(<PurchaseOrderItemForm purchaseOrderId="po-1" itemId="item-1" />);

    expect(await screen.findByText("Cimento")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("editing an item that isn't on the already-loaded order shows 'Item não encontrado', never a fabricated fetch", async () => {
    orderState.order = order({ items: [] });
    render(<PurchaseOrderItemForm purchaseOrderId="po-1" itemId="missing-item" />);
    expect(await screen.findByText(/item não encontrado/i)).toBeInTheDocument();
  });

  it("shows already-received quantity as a hint when editing a partially-received item", async () => {
    orderState.order = order({
      items: [item({ id: "item-1", received_quantity: "3.000", remaining_quantity: "7.000" })],
    });
    render(<PurchaseOrderItemForm purchaseOrderId="po-1" itemId="item-1" />);
    expect(await screen.findByText(/já recebido: 3/i)).toBeInTheDocument();
  });

  it("TM9: an item update that resolves after switching Company produces zero navigation", async () => {
    orderState.order = order({ items: [item({ id: "item-1" })] });
    let resolveUpdate!: (value: PurchaseOrderItem) => void;
    vi.mocked(updatePurchaseOrderItem).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderItemForm purchaseOrderId="po-1" itemId="item-1" />);
    await screen.findByText("Cimento");

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderItemForm purchaseOrderId="po-1" itemId="item-1" />);

    resolveUpdate(item({ id: "item-1" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(push).not.toHaveBeenCalled();
  });

  it("TM8: an item create that resolves after switching Company produces zero navigation", async () => {
    orderState.order = order({ items: [] });
    materialsState.materials = [material("mat-2", "Areia")];
    let resolveCreate!: (value: PurchaseOrderItem) => void;
    vi.mocked(createPurchaseOrderItem).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderItemForm purchaseOrderId="po-1" />);

    const trigger = await screen.findByRole("combobox");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Areia" }));
    await user.type(screen.getByLabelText(/quantidade/i), "5");
    await user.click(screen.getByRole("button", { name: /adicionar item/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderItemForm purchaseOrderId="po-1" />);

    resolveCreate(item({ id: "item-2" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(push).not.toHaveBeenCalled();
  });
});
