import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { ServiceOrderDetail } from "../service-order-detail";
import type { ServiceOrder, ServiceOrderItem } from "../types";

// The Add/Edit item dialogs render via `ResponsiveDialog`, which reads
// `window.matchMedia` to pick Dialog vs Sheet — jsdom has no real
// implementation, so every test in this file needs a stub (mirrors the
// wizard's own test setup for the same underlying dialogs).
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../service-orders-client", () => ({
  getServiceOrder: vi.fn(),
  startServiceOrder: vi.fn(),
  completeServiceOrder: vi.fn(),
  cancelServiceOrder: vi.fn(),
  addServiceOrderItem: vi.fn(),
  updateServiceOrderItem: vi.fn(),
  deleteServiceOrderItem: vi.fn(),
}));

vi.mock("@/features/catalog/catalog-client", () => ({
  listCatalogItems: vi.fn(),
  createCatalogItem: vi.fn(),
}));

import { createCatalogItem, listCatalogItems } from "@/features/catalog/catalog-client";
import {
  addServiceOrderItem,
  cancelServiceOrder,
  completeServiceOrder,
  deleteServiceOrderItem,
  getServiceOrder,
  startServiceOrder,
  updateServiceOrderItem,
} from "../service-orders-client";

const emptyCatalogPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

function catalogItem(overrides: Partial<import("@/features/catalog/types").CatalogItem> = {}) {
  return {
    id: "cat-1",
    type: "product" as const,
    code: "PROD-1",
    name: "Cimento CP-II",
    category: null,
    unit: "sc",
    description: null,
    cost_price: "20.00",
    sale_price: "30.00",
    active: true,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function serviceOrderItem(overrides: Partial<ServiceOrderItem> = {}): ServiceOrderItem {
  return {
    id: "item-1",
    catalog_item_id: "cat-1",
    type: "product",
    code: "PROD-1",
    name: "Cimento CP-II",
    unit: "sc",
    description: null,
    quantity: "2.000",
    unit_price: "30.00",
    line_discount: "0.00",
    line_total: "60.00",
    notes: null,
    sort_order: 0,
    ...overrides,
  };
}

function order(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: "os-1",
    number: "OS-000001",
    status: "open",
    title: "Reparo elétrico",
    customer_id: "cust-1",
    customer_address_id: "addr-1",
    customer_contact_id: null,
    responsible_user_id: null,
    description: null,
    customer: { name: "Cliente Teste", document: null, phone: null, email: null },
    execution_address: {
      label: "Endereço Centro",
      type: "work_site",
      postal_code: null,
      street: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: null,
      state: null,
      reference_point: null,
    },
    contact: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    notes: null,
    subtotal: "0.00",
    order_discount: "0.00",
    travel_fee: "0.00",
    total: "0.00",
    items: [],
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("ServiceOrderDetail", () => {
  beforeEach(() => {
    vi.mocked(getServiceOrder).mockReset();
    vi.mocked(startServiceOrder).mockReset();
    vi.mocked(completeServiceOrder).mockReset();
    vi.mocked(cancelServiceOrder).mockReset();
    vi.mocked(addServiceOrderItem).mockReset();
    vi.mocked(updateServiceOrderItem).mockReset();
    vi.mocked(deleteServiceOrderItem).mockReset();
    vi.mocked(listCatalogItems).mockReset().mockResolvedValue(emptyCatalogPage);
    vi.mocked(createCatalogItem).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("D1: renders the O.S. number, title and status", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.getAllByText("Reparo elétrico").length).toBeGreaterThan(0);
    expect(screen.getByText("Aberta")).toBeInTheDocument();
  });

  it("D2: an open O.S. shows Iniciar, Concluir and Cancelar actions", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("D3: an in_progress O.S. shows Concluir and Cancelar but not Iniciar", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "in_progress" }));
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("D4: a completed O.S. shows no mutable actions", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z" }));
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("D5: a cancelled O.S. shows no mutable actions and displays the cancellation reason", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(
      order({ status: "cancelled", cancelled_at: "2026-09-10T12:00:00Z", cancellation_reason: "Cliente desistiu" })
    );
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    expect(screen.getByText("Cliente desistiu")).toBeInTheDocument();
  });

  it("D6: clicking Iniciar calls startServiceOrder and updates with the real response", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    vi.mocked(startServiceOrder).mockResolvedValue(order({ status: "in_progress", started_at: "2026-09-10T09:00:00Z" }));
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getByRole("button", { name: "Iniciar" }));

    await waitFor(() => expect(screen.getByText("Em andamento")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
  });

  it("D7: clicking Concluir asks for confirmation before calling completeServiceOrder", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    vi.mocked(completeServiceOrder).mockResolvedValue(order({ status: "completed", completed_at: "2026-09-10T09:00:00Z" }));
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getAllByRole("button", { name: "Concluir" })[0]!);
    await screen.findByText("Concluir esta O.S.?");
    expect(completeServiceOrder).not.toHaveBeenCalled();

    const confirmButtons = screen.getAllByRole("button", { name: "Concluir" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);
    await waitFor(() => expect(completeServiceOrder).toHaveBeenCalledWith("os-1"));
  });

  it("D8: an open O.S. can be completed directly, without requiring Start first", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.getByRole("button", { name: "Concluir" })).not.toBeDisabled();
  });

  it("D9: Cancelar requires a non-empty reason before submitting", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await screen.findByText("Cancelar esta O.S.?");
    expect(screen.getByRole("button", { name: "Cancelar O.S." })).toBeDisabled();

    await user.type(screen.getByLabelText("Motivo"), "Cliente desistiu");
    expect(screen.getByRole("button", { name: "Cancelar O.S." })).not.toBeDisabled();
  });

  it("D10: submitting a cancellation reason calls cancelServiceOrder with {reason}", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
    vi.mocked(cancelServiceOrder).mockResolvedValue(
      order({ status: "cancelled", cancellation_reason: "Cliente desistiu" })
    );
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.type(screen.getByLabelText("Motivo"), "Cliente desistiu");
    await user.click(screen.getByRole("button", { name: "Cancelar O.S." }));

    await waitFor(() => expect(cancelServiceOrder).toHaveBeenCalledWith("os-1", "Cliente desistiu"));
  });

  it("D11: a 409 on Iniciar reloads the O.S. instead of crashing", async () => {
    vi.mocked(getServiceOrder).mockResolvedValueOnce(order({ status: "open" })).mockResolvedValueOnce(order({ status: "in_progress" }));
    vi.mocked(startServiceOrder).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getByRole("button", { name: "Iniciar" }));

    await screen.findByRole("alert");
    await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
  });

  it("D12: switching company hides Company A's O.S. before Company B's response arrives", async () => {
    let resolveB!: (value: ServiceOrder) => void;
    const bPromise = new Promise<ServiceOrder>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(getServiceOrder).mockResolvedValueOnce(order({ number: "OS-000001" })).mockReturnValueOnce(bPromise);

    const { rerender } = render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderDetail id="os-1" />);

    expect(screen.queryByText("OS-000001")).not.toBeInTheDocument();
    resolveB(order({ number: "OS-000002" }));
    await screen.findAllByText("OS-000002");
  });

  it("D13: a 404 shows a not-found message", async () => {
    vi.mocked(getServiceOrder).mockRejectedValue(new ApiError(404, "Not found"));
    render(<ServiceOrderDetail id="missing" />);
    await screen.findByText("O.S. não encontrada");
  });

  it("D14: a network error shows a retry affordance, never an infinite skeleton", async () => {
    vi.mocked(getServiceOrder).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ServiceOrderDetail id="os-1" />);

    await screen.findByRole("button", { name: /tentar novamente/i });
    vi.mocked(getServiceOrder).mockResolvedValueOnce(order());
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await screen.findAllByText("OS-000001");
  });

  it("D15: no delete action is ever rendered — the API has no DELETE route for a service order", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
  });

  it("D16: never mentions Obra/Projeto anywhere on the page", async () => {
    vi.mocked(getServiceOrder).mockResolvedValue(order());
    render(<ServiceOrderDetail id="os-1" />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByText(/obra/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/projeto/i)).not.toBeInTheDocument();
  });

  describe("Editar dados link", () => {
    it("EI-edit-link-1: shows 'Editar dados' for open/in_progress, hides it for completed/cancelled", async () => {
      vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");
      expect(screen.getByRole("link", { name: /editar dados/i })).toHaveAttribute("href", "/ordens-servico/os-1/editar");

      vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z" }));
      rerender(<ServiceOrderDetail id="os-2" />);
      await screen.findAllByText("OS-000001");
      expect(screen.queryByRole("link", { name: /editar dados/i })).not.toBeInTheDocument();
    });
  });

  describe("Item management", () => {
    it("EI1: open/in_progress show add/edit/remove item controls, completed/cancelled show none", async () => {
      const withItem = order({ status: "open", items: [serviceOrderItem()] });
      vi.mocked(getServiceOrder).mockResolvedValue(withItem);
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");
      expect(screen.getByRole("button", { name: /adicionar item/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /editar cimento cp-ii/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remover cimento cp-ii/i })).toBeInTheDocument();

      vi.mocked(getServiceOrder).mockResolvedValue(
        order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [serviceOrderItem()] })
      );
      rerender(<ServiceOrderDetail id="os-2" />);
      await screen.findAllByText("OS-000001");
      expect(screen.queryByRole("button", { name: /adicionar item/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /editar cimento cp-ii/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remover cimento cp-ii/i })).not.toBeInTheDocument();
    });

    it("EI2: an existing item whose CatalogItem has since gone inactive still renders normally, editable, from its own snapshot", async () => {
      vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open", items: [serviceOrderItem()] }));
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");
      // The row is driven entirely by the item's own snapshot fields —
      // never by re-fetching the current CatalogItem — so it renders and
      // stays editable regardless of the catalog item's current `active`.
      expect(screen.getByText("Cimento CP-II")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /editar cimento cp-ii/i })).not.toBeDisabled();
    });

    it("EI3: adding an item builds the exact payload shape and triggers a full parent refetch whose response drives the displayed totals", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", subtotal: "0.00", total: "0.00", items: [] }))
        .mockResolvedValueOnce(
          order({ status: "open", subtotal: "60.00", total: "60.00", items: [serviceOrderItem()] })
        );
      vi.mocked(listCatalogItems).mockResolvedValue({ ...emptyCatalogPage, data: [catalogItem()] });
      vi.mocked(addServiceOrderItem).mockResolvedValue(serviceOrderItem());
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /adicionar item/i }));
      await user.type(screen.getByLabelText(/buscar produto ou serviço/i), "cimento");
      await screen.findByText("Cimento CP-II");
      await user.click(screen.getByRole("button", { name: "Selecionar" }));
      await user.click(screen.getByRole("button", { name: "Adicionar" }));

      await waitFor(() =>
        expect(addServiceOrderItem).toHaveBeenCalledWith("os-1", {
          catalog_item_id: "cat-1",
          quantity: "1.000",
          unit_price: "30.00",
          line_discount: "0.00",
          notes: null,
        })
      );
      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getAllByText((text) => text.includes("60,00")).length).toBeGreaterThan(0));
    });

    it("EI4: editing an item never sends catalog_item_id and triggers a refetch", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }))
        .mockResolvedValueOnce(
          order({ status: "open", items: [serviceOrderItem({ quantity: "3.000", line_total: "90.00" })] })
        );
      vi.mocked(updateServiceOrderItem).mockResolvedValue(serviceOrderItem({ quantity: "3.000", line_total: "90.00" }));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /editar cimento cp-ii/i }));
      const qtyInput = await screen.findByLabelText("Quantidade");
      await user.clear(qtyInput);
      await user.type(qtyInput, "3");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(updateServiceOrderItem).toHaveBeenCalledWith("os-1", "item-1", {
          quantity: "3.000",
          unit_price: "30.00",
          line_discount: "0.00",
          notes: null,
        })
      );
      const call = vi.mocked(updateServiceOrderItem).mock.calls[0]![2] as unknown as Record<string, unknown>;
      expect(call).not.toHaveProperty("catalog_item_id");
      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
    });

    it("EI5: remove shows a confirmation with catalog-safe wording and a successful remove triggers a refetch", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }))
        .mockResolvedValueOnce(order({ status: "open", items: [] }));
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await screen.findByText("Remover este item da O.S.?");
      expect(screen.queryByText(/excluir.*catálogo/i)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-1"));
      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
    });

    it("EI6: a 422 on remove (discount exceeds new subtotal) leaves the item in place, shows the message, and never refetches", async () => {
      vi.mocked(getServiceOrder).mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }));
      vi.mocked(deleteServiceOrderItem).mockRejectedValue(
        new ApiValidationError({ order_discount: ["O desconto da O.S. não pode ser maior que o novo subtotal."] })
      );
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));

      await screen.findByText("O desconto da O.S. não pode ser maior que o novo subtotal.");
      expect(getServiceOrder).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Cimento CP-II")).toBeInTheDocument();
    });

    it("EI7: a 409 on add/edit/remove triggers a refetch and the order renders as terminal once it now is", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }))
        .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [serviceOrderItem()] }));
      vi.mocked(deleteServiceOrderItem).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));

      await screen.findByText("A O.S. foi alterada por outro usuário.");
      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("button", { name: /remover cimento cp-ii/i })).not.toBeInTheDocument());
    });

    it("EI8: a CatalogItem created via the Add dialog's quick-create stays intact even if the add-to-order POST 409s", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [] }))
        .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [] }));
      vi.mocked(createCatalogItem).mockResolvedValue(catalogItem({ id: "cat-new", name: "Novo produto" }));
      vi.mocked(addServiceOrderItem).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /adicionar item/i }));
      await user.click(screen.getByRole("button", { name: /novo produto/i }));
      await user.type(screen.getByLabelText(/nome/i), "Novo produto");
      await user.type(screen.getByLabelText(/unidade/i), "un");
      await user.click(screen.getByRole("button", { name: /salvar e adicionar à o\.s\./i }));

      await waitFor(() => expect(createCatalogItem).toHaveBeenCalled());
      await user.click(await screen.findByRole("button", { name: "Adicionar" }));

      await screen.findByText("O item foi cadastrado no catálogo, mas a O.S. não pode mais ser alterada.");
      // The CatalogItem itself is never rolled back — no delete call exists in the client at all.
      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
    });

    it("EI9: no DELETE-the-whole-order capability exists anywhere on this page", async () => {
      vi.mocked(getServiceOrder).mockResolvedValue(order({ status: "open" }));
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");
      expect(screen.queryByRole("button", { name: /excluir o\.s\./i })).not.toBeInTheDocument();
    });
  });

  describe("Tenant safety for item management", () => {
    it("ET1: cross-tenant access renders as 404, never a 500 or a leak", async () => {
      vi.mocked(getServiceOrder).mockRejectedValue(new ApiError(404, "Not found"));
      render(<ServiceOrderDetail id="foreign-os" />);
      await screen.findByText("O.S. não encontrada");
    });

    it("ET2: switching company while the Add item dialog is open closes it (the whole subtree unmounts on tenant switch)", async () => {
      let resolveB!: (value: ServiceOrder) => void;
      const bPromise = new Promise<ServiceOrder>((resolve) => {
        resolveB = resolve;
      });
      vi.mocked(getServiceOrder).mockResolvedValueOnce(order({ status: "open" })).mockReturnValueOnce(bPromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /adicionar item/i }));
      await screen.findByLabelText(/buscar produto ou serviço/i);

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);

      expect(screen.queryByLabelText(/buscar produto ou serviço/i)).not.toBeInTheDocument();
      resolveB(order({ status: "open", number: "OS-000002" }));
      await screen.findAllByText("OS-000002");
    });

    it("ET3: a late post-mutation parent-refresh for Company A never repaints under Company B", async () => {
      let resolveRefetch!: (value: ServiceOrder) => void;
      const refetchPromise = new Promise<ServiceOrder>((resolve) => {
        resolveRefetch = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] })) // initial load, company A
        .mockReturnValueOnce(refetchPromise) // post-delete refresh fired under company A — resolves late, must be discarded
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002", items: [] })); // company B's own fresh load
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalled());

      // The company switches before the post-delete refetch (Company A's
      // request) resolves — the whole subtree has already unmounted, so
      // there is nothing left for a late Company-A response to repaint.
      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");

      // Only now does the STALE company-A refresh resolve — still carrying
      // the old item — and it must never repaint under company B.
      resolveRefetch(order({ status: "open", items: [serviceOrderItem()] }));
      await waitFor(() => expect(screen.queryByText("Cimento CP-II")).not.toBeInTheDocument());
    });
  });

  describe("Conflict handling for item mutations", () => {
    it("EC1: add-item 409 triggers a refetch", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [] }))
        .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [] }));
      vi.mocked(listCatalogItems).mockResolvedValue({ ...emptyCatalogPage, data: [catalogItem()] });
      vi.mocked(addServiceOrderItem).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /adicionar item/i }));
      await user.type(screen.getByLabelText(/buscar produto ou serviço/i), "cimento");
      await screen.findByText("Cimento CP-II");
      await user.click(screen.getByRole("button", { name: "Selecionar" }));
      await user.click(screen.getByRole("button", { name: "Adicionar" }));

      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
    });

    it("EC2: edit-item 409 triggers a refetch", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }))
        .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [serviceOrderItem()] }));
      vi.mocked(updateServiceOrderItem).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /editar cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() => expect(getServiceOrder).toHaveBeenCalledTimes(2));
      await screen.findByText("A O.S. foi alterada por outro usuário.");
    });

    it("EC3: no code path automatically retries a mutation after a 409 — the rendered UI reflects only the latest server response", async () => {
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] }))
        .mockResolvedValueOnce(order({ status: "completed", completed_at: "2026-09-10T12:00:00Z", items: [serviceOrderItem()] }));
      vi.mocked(deleteServiceOrderItem).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));

      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledTimes(1));
      await screen.findByText("A O.S. foi alterada por outro usuário.");
      expect(deleteServiceOrderItem).toHaveBeenCalledTimes(1);
    });
  });

  describe("Ordering guarantees (async-race hardening)", () => {
    it("O1: a late `start` response for Company A, resolving after a switch to Company B, is discarded", async () => {
      let resolveStart!: (value: ServiceOrder) => void;
      const startPromise = new Promise<ServiceOrder>((resolve) => {
        resolveStart = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000001" }))
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002" }));
      vi.mocked(startServiceOrder).mockReturnValue(startPromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: "Iniciar" }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");
      expect(screen.getByRole("button", { name: "Iniciar" })).not.toBeDisabled();

      resolveStart(order({ status: "in_progress", number: "OS-000001", started_at: "2026-09-10T09:00:00Z" }));
      await waitFor(() => expect(screen.queryByText("Em andamento")).not.toBeInTheDocument());
      expect(screen.getAllByText("OS-000002")[0]!).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Iniciar" })).not.toBeDisabled();
    });

    it("O2: a late `complete` response for Company A, resolving after a switch to Company B, is discarded", async () => {
      let resolveComplete!: (value: ServiceOrder) => void;
      const completePromise = new Promise<ServiceOrder>((resolve) => {
        resolveComplete = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000001" }))
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002" }));
      vi.mocked(completeServiceOrder).mockReturnValue(completePromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getAllByRole("button", { name: "Concluir" })[0]!);
      await screen.findByText("Concluir esta O.S.?");
      const confirmButtons = screen.getAllByRole("button", { name: "Concluir" });
      await user.click(confirmButtons[confirmButtons.length - 1]!);

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");
      expect(screen.getAllByRole("button", { name: "Concluir" })[0]!).not.toBeDisabled();

      resolveComplete(order({ status: "completed", number: "OS-000001", completed_at: "2026-09-10T09:00:00Z" }));
      await waitFor(() => expect(screen.queryByText("Concluída")).not.toBeInTheDocument());
      expect(screen.getAllByText("OS-000002")[0]!).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("O3: a late `cancel` response for Company A, resolving after a switch to Company B, is discarded", async () => {
      let resolveCancel!: (value: ServiceOrder) => void;
      const cancelPromise = new Promise<ServiceOrder>((resolve) => {
        resolveCancel = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000001" }))
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002" }));
      vi.mocked(cancelServiceOrder).mockReturnValue(cancelPromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      await user.type(screen.getByLabelText("Motivo"), "Cliente desistiu");
      await user.click(screen.getByRole("button", { name: "Cancelar O.S." }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");

      resolveCancel(
        order({ status: "cancelled", number: "OS-000001", cancellation_reason: "Cliente desistiu" })
      );
      await waitFor(() => expect(screen.queryByText("Cancelada")).not.toBeInTheDocument());
      expect(screen.getAllByText("OS-000002")[0]!).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("O4: a late non-409 action error for Company A does not surface under Company B", async () => {
      let rejectStart!: (error: unknown) => void;
      const startPromise = new Promise<ServiceOrder>((_resolve, reject) => {
        rejectStart = reject;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000001" }))
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002" }));
      vi.mocked(startServiceOrder).mockReturnValue(startPromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: "Iniciar" }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");

      rejectStart(new Error("network"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getAllByText("OS-000002")[0]!).toBeInTheDocument();
    });

    it("O5: a late action's `finally` for Company A never clears/alters Company B's own independent loading state", async () => {
      let resolveStart!: (value: ServiceOrder) => void;
      const startPromise = new Promise<ServiceOrder>((resolve) => {
        resolveStart = resolve;
      });
      let resolveComplete!: (value: ServiceOrder) => void;
      const completePromise = new Promise<ServiceOrder>((resolve) => {
        resolveComplete = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000001" }))
        .mockResolvedValueOnce(order({ status: "open", number: "OS-000002" }));
      vi.mocked(startServiceOrder).mockReturnValue(startPromise);
      vi.mocked(completeServiceOrder).mockReturnValue(completePromise);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      // Company A's own start action is left in flight.
      await user.click(screen.getByRole("button", { name: "Iniciar" }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000002");

      // Company B fires its own, independent action (Concluir) — still in flight.
      await user.click(screen.getAllByRole("button", { name: "Concluir" })[0]!);
      await screen.findByText("Concluir esta O.S.?");
      const confirmButtons = screen.getAllByRole("button", { name: "Concluir" });
      await user.click(confirmButtons[confirmButtons.length - 1]!);
      expect(screen.getAllByRole("button", { name: "Concluir" })[0]!).toBeDisabled();

      // The stale Company-A start resolves now — its `finally` must not
      // touch B's `actionLoading`, which is still legitimately true.
      resolveStart(order({ status: "in_progress", number: "OS-000001" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getAllByRole("button", { name: "Concluir" })[0]!).toBeDisabled();

      resolveComplete(order({ status: "completed", number: "OS-000002", completed_at: "2026-09-10T09:00:00Z" }));
      await waitFor(() => expect(screen.getByText("Concluída")).toBeInTheDocument());
    });

    it("O6: a refresh that started SECOND but resolves FIRST wins; the one that started first resolving second is discarded", async () => {
      let resolveR1!: (value: ServiceOrder) => void;
      const r1Promise = new Promise<ServiceOrder>((resolve) => {
        resolveR1 = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(
          order({
            status: "open",
            items: [serviceOrderItem({ id: "item-1", name: "Cimento CP-II" }), serviceOrderItem({ id: "item-2", name: "Areia Média" })],
          })
        ) // initial load
        .mockReturnValueOnce(r1Promise) // R1 — started first (from removing item-1), resolves last
        .mockResolvedValueOnce(order({ status: "open", subtotal: "300.00", total: "300.00", items: [] })); // R2 — started second, resolves first
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-1"));

      await user.click(screen.getByRole("button", { name: /remover areia média/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-2"));

      // R2 (started second) has already resolved via mockResolvedValueOnce
      // by the time its promise microtask settles.
      await waitFor(() => expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0));

      // R1 (started first) now resolves — carrying an older, smaller subtotal — and must be discarded.
      resolveR1(order({ status: "open", subtotal: "100.00", total: "100.00", items: [serviceOrderItem({ id: "item-2", name: "Areia Média" })] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0);
      expect(screen.queryByText((text) => text.includes("100,00"))).not.toBeInTheDocument();
    });

    it("O7: a terminal snapshot that resolves first wins over an older, still-open in-flight refresh that resolves after it", async () => {
      let resolveOldRefresh!: (value: ServiceOrder) => void;
      const oldRefreshPromise = new Promise<ServiceOrder>((resolve) => {
        resolveOldRefresh = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ status: "open", items: [serviceOrderItem()] })) // initial load
        .mockReturnValueOnce(oldRefreshPromise); // the older item-mutation refresh, started before completion, resolves last
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      vi.mocked(completeServiceOrder).mockResolvedValue(
        order({ status: "completed", completed_at: "2026-09-10T09:00:00Z", items: [serviceOrderItem()] })
      );
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      // The older refresh (from a remove-item mutation) is fired and left pending.
      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalled());

      // A newer action (Concluir) starts AFTER the refresh above and resolves before it.
      await user.click(screen.getAllByRole("button", { name: "Concluir" })[0]!);
      await screen.findByText("Concluir esta O.S.?");
      const confirmButtons = screen.getAllByRole("button", { name: "Concluir" });
      await user.click(confirmButtons[confirmButtons.length - 1]!);

      await waitFor(() => expect(screen.getByText("Concluída")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();

      // The older, still-open snapshot now resolves — it must not reopen the terminal UI.
      resolveOldRefresh(order({ status: "open", items: [serviceOrderItem()] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByText("Concluída")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
    });

    it("O8: the latest totals/status persist on screen with no flicker back to a stale value", async () => {
      let resolveR1!: (value: ServiceOrder) => void;
      const r1Promise = new Promise<ServiceOrder>((resolve) => {
        resolveR1 = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(
          order({
            status: "open",
            items: [serviceOrderItem({ id: "item-1", name: "Cimento CP-II" }), serviceOrderItem({ id: "item-2", name: "Areia Média" })],
          })
        )
        .mockReturnValueOnce(r1Promise)
        .mockResolvedValueOnce(order({ status: "open", subtotal: "300.00", total: "300.00", items: [] }));
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-1"));

      await user.click(screen.getByRole("button", { name: /remover areia média/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-2"));

      await waitFor(() => expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0));

      resolveR1(order({ status: "open", subtotal: "100.00", total: "100.00", items: [serviceOrderItem({ id: "item-2", name: "Areia Média" })] }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Re-render (e.g. a parent-triggered re-render) must not resurrect the stale value either.
      rerender(<ServiceOrderDetail id="os-1" />);
      expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0);
      expect(screen.queryByText((text) => text.includes("100,00"))).not.toBeInTheDocument();
    });

    it("O9: a refresh for order X, resolving after navigating to order Y, never paints onto Y's view", async () => {
      let resolveXRefresh!: (value: ServiceOrder) => void;
      const xRefreshPromise = new Promise<ServiceOrder>((resolve) => {
        resolveXRefresh = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(order({ id: "os-1", number: "OS-000001", status: "open", items: [serviceOrderItem()] })) // load X
        .mockReturnValueOnce(xRefreshPromise) // X's item-mutation refresh — resolves late
        .mockResolvedValueOnce(order({ id: "os-2", number: "OS-000002", status: "open", items: [] })); // load Y
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      const { rerender } = render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalled());

      // The user navigates from X to a different order, Y, within the same company.
      rerender(<ServiceOrderDetail id="os-2" />);
      await screen.findAllByText("OS-000002");

      resolveXRefresh(order({ id: "os-1", number: "OS-000001", status: "open", items: [serviceOrderItem()] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getAllByText("OS-000002")[0]!).toBeInTheDocument();
      expect(screen.queryByText("OS-000001")).not.toBeInTheDocument();
      expect(screen.queryByText("Cimento CP-II")).not.toBeInTheDocument();
    });

    it("O10: under an arbitrary interleaving of multiple in-flight reads, only the response for the latest-started read is ever applied", async () => {
      let resolveR1!: (value: ServiceOrder) => void;
      const r1Promise = new Promise<ServiceOrder>((resolve) => {
        resolveR1 = resolve;
      });
      let resolveR2!: (value: ServiceOrder) => void;
      const r2Promise = new Promise<ServiceOrder>((resolve) => {
        resolveR2 = resolve;
      });
      let resolveR3!: (value: ServiceOrder) => void;
      const r3Promise = new Promise<ServiceOrder>((resolve) => {
        resolveR3 = resolve;
      });
      vi.mocked(getServiceOrder)
        .mockResolvedValueOnce(
          order({
            status: "open",
            items: [
              serviceOrderItem({ id: "item-1", name: "Cimento CP-II" }),
              serviceOrderItem({ id: "item-2", name: "Areia Média" }),
              serviceOrderItem({ id: "item-3", name: "Tijolo Comum" }),
            ],
          })
        ) // initial load
        .mockReturnValueOnce(r1Promise) // R1 — fired first (from removing item-1)
        .mockReturnValueOnce(r2Promise) // R2 — fired second (from removing item-2)
        .mockReturnValueOnce(r3Promise); // R3 — fired third (from removing item-3) — the latest-started
      vi.mocked(deleteServiceOrderItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<ServiceOrderDetail id="os-1" />);
      await screen.findAllByText("OS-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-1"));

      await user.click(screen.getByRole("button", { name: /remover areia média/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-2"));

      await user.click(screen.getByRole("button", { name: /remover tijolo comum/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteServiceOrderItem).toHaveBeenCalledWith("os-1", "item-3"));

      // Resolve deliberately out of fire order: R2, then R3, then R1 — only
      // R3 (the latest-started read) may ever be applied.
      resolveR2(order({ status: "open", subtotal: "200.00", total: "200.00", items: [] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      resolveR3(order({ status: "open", subtotal: "300.00", total: "300.00", items: [] }));
      await waitFor(() => expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0));
      resolveR1(order({ status: "open", subtotal: "100.00", total: "100.00", items: [] }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getAllByText((text) => text.includes("300,00")).length).toBeGreaterThan(0);
      expect(screen.queryByText((text) => text.includes("200,00"))).not.toBeInTheDocument();
      expect(screen.queryByText((text) => text.includes("100,00"))).not.toBeInTheDocument();
    });
  });
});
