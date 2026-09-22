import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/projects/use-all-projects", () => ({
  useAllProjects: () => ({ projects: [], error: false, reload: vi.fn() }),
}));

vi.mock("../purchase-orders-client", () => ({
  deletePurchaseOrder: vi.fn(),
}));

const listState: {
  response: unknown;
  error: boolean;
  loading: boolean;
} = { response: undefined, error: false, loading: false };
const reload = vi.fn();
vi.mock("../use-purchase-orders", () => ({
  usePurchaseOrderList: () => ({ ...listState, reload }),
}));

import { deletePurchaseOrder } from "../purchase-orders-client";
import { PurchaseOrderList } from "../purchase-order-list";
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
    items_count: 1,
    total: "100.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
}

function page(data: PurchaseOrderListItem[]): PurchaseOrderPaginationResponse {
  return {
    data,
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: data.length, total: data.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/**
 * SUPPLY-FRONTEND-01C1 §14/TM1-TM3. `DeleteState` is tagged with
 * `{companyId, purchaseOrder, error}` — the dialog only ever renders for
 * the Company that opened it, and a delete response that resolves after
 * a Company switch produces zero close/error/reload for the OLD Company.
 */
describe("PurchaseOrderList — SUPPLY-FRONTEND-01C1 (TM1-TM3)", () => {
  beforeEach(() => {
    reload.mockReset();
    vi.mocked(deletePurchaseOrder).mockReset();
    listState.response = page([listItem("po-1")]);
    listState.error = false;
    listState.loading = false;
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("TM1: the delete dialog opened under Company A disappears once switched to Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderList />);

    const deleteButton = (await screen.findAllByRole("button", { name: /excluir pedido/i }))[0];
    await user.click(deleteButton);
    expect(await screen.findByText(/excluir o pedido de compra/i)).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderList />);

    expect(screen.queryByText(/excluir o pedido de compra/i)).not.toBeInTheDocument();
  });

  it("TM2: a late successful delete for Company A never closes/reloads under Company B", async () => {
    let resolveDelete!: () => void;
    vi.mocked(deletePurchaseOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderList />);

    await user.click((await screen.findAllByRole("button", { name: /excluir pedido/i }))[0]);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderList />);

    resolveDelete();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reload).not.toHaveBeenCalled();
  });

  it("TM3: a late delete error for Company A never shows in the dialog under Company B", async () => {
    let rejectDelete!: (error: unknown) => void;
    vi.mocked(deletePurchaseOrder).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDelete = reject;
      })
    );

    const user = userEvent.setup();
    const { rerender } = render(<PurchaseOrderList />);

    await user.click((await screen.findAllByRole("button", { name: /excluir pedido/i }))[0]);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<PurchaseOrderList />);

    rejectDelete(new Error("network"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText(/não foi possível excluir agora/i)).not.toBeInTheDocument();
  });

  it("current-tenant delete still works: confirms, calls the API, and reloads", async () => {
    vi.mocked(deletePurchaseOrder).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PurchaseOrderList />);

    await user.click((await screen.findAllByRole("button", { name: /excluir pedido/i }))[0]);
    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(deletePurchaseOrder).toHaveBeenCalledWith("po-1", { updated_at: "2026-09-10T00:00:00Z" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
