import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

import { ServiceOrderList } from "../service-order-list";
import type { ServiceOrderListItem, ServiceOrderPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../service-orders-client", () => ({
  listServiceOrders: vi.fn(),
  getServiceOrderSettings: vi.fn(),
  updateServiceOrderSettings: vi.fn(),
}));

import { getServiceOrderSettings, listServiceOrders, updateServiceOrderSettings } from "../service-orders-client";

function item(number: string, overrides: Partial<ServiceOrderListItem> = {}): ServiceOrderListItem {
  return {
    id: `id-${number}`,
    number,
    status: "open",
    title: "Reparo elétrico",
    customer: { id: "cust-1", name: "Cliente Teste" },
    execution_address: { label: "Obra Centro", city: "Belo Horizonte", state: "MG" },
    contact: null,
    scheduled_start_at: null,
    subtotal: "0.00",
    order_discount: "0.00",
    travel_fee: "0.00",
    total: "0.00",
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(numbers: string[], currentPage = 1, lastPage = 1): ServiceOrderPaginationResponse {
  return {
    data: numbers.map((number) => item(number)),
    meta: { current_page: currentPage, from: 1, last_page: lastPage, per_page: 15, to: numbers.length, total: numbers.length },
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe("ServiceOrderList", () => {
  beforeEach(() => {
    vi.mocked(listServiceOrders).mockReset();
    vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "0.00" });
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("L1: renders Company A's service orders", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000001", "OS-000002"]));
    render(<ServiceOrderList />);

    await screen.findAllByText("OS-000001");
    expect(screen.queryAllByText("OS-000002").length).toBeGreaterThan(0);
  });

  it("L2: switching company hides A's orders before B's response arrives", async () => {
    let resolveB!: (value: ServiceOrderPaginationResponse) => void;
    const bPromise = new Promise<ServiceOrderPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listServiceOrders).mockResolvedValueOnce(page(["OS-000001"])).mockReturnValueOnce(bPromise);

    const { rerender } = render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    expect(screen.queryAllByText("OS-000001").length).toBe(0);

    resolveB(page(["OS-000002"]));
    await screen.findAllByText("OS-000002");
  });

  it("L3: a late response from the old tenant never reappears after the new tenant loaded", async () => {
    let resolveA!: (value: ServiceOrderPaginationResponse) => void;
    const aPromise = new Promise<ServiceOrderPaginationResponse>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(listServiceOrders).mockReturnValueOnce(aPromise).mockResolvedValueOnce(page(["OS-000002"]));

    const { rerender } = render(<ServiceOrderList />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    await screen.findAllByText("OS-000002");
    resolveA(page(["OS-000001"]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryAllByText("OS-000001").length).toBe(0);
  });

  it("L4: switching company resets the page back to 1", async () => {
    vi.mocked(listServiceOrders).mockResolvedValueOnce(page(["OS-000001"], 5, 5)).mockResolvedValueOnce(page(["OS-000002"], 1, 1));

    const { rerender } = render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");
    await screen.findByText("Página 5 de 5");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    await screen.findAllByText("OS-000002");
    const secondCall = vi.mocked(listServiceOrders).mock.calls[1]![0];
    expect(secondCall.page).toBe(1);
  });

  it("L5: shows a distinct empty state (with CTA) when there are no O.S. at all", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    render(<ServiceOrderList />);

    await screen.findByText("Nenhuma O.S. ainda");
    expect(screen.getByRole("button", { name: /nova o\.s\./i })).toBeInTheDocument();
  });

  it("L6: shows a distinct empty state (no CTA) when a search produces zero results", async () => {
    vi.mocked(listServiceOrders).mockResolvedValueOnce(page(["OS-000001"])).mockResolvedValueOnce(page([]));
    const user = userEvent.setup();
    render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");

    await user.type(screen.getByLabelText(/buscar ordens de serviço/i), "inexistente");
    await screen.findByText("Nenhuma O.S. encontrada", {}, { timeout: 2000 });
  });

  it("L7: the O.S. number is shown verbatim, never reformatted", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000042"]));
    render(<ServiceOrderList />);
    await screen.findAllByText("OS-000042");
  });

  it("L8: status is shown as visible text, never color-only", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000001"]));
    render(<ServiceOrderList />);
    await screen.findAllByText("Aberta");
  });

  it("L9: status filter buttons send the selected status param", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000001"]));
    const user = userEvent.setup();
    render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");

    await user.click(screen.getByRole("button", { name: "Concluídas" }));

    await waitFor(() => {
      const lastCall = vi.mocked(listServiceOrders).mock.calls.at(-1)![0];
      expect(lastCall.status).toBe("completed");
    });
  });

  it("L10: an error state offers a retry action", async () => {
    vi.mocked(listServiceOrders).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<ServiceOrderList />);

    await screen.findByRole("alert");
    vi.mocked(listServiceOrders).mockResolvedValueOnce(page(["OS-000001"]));
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await screen.findAllByText("OS-000001");
  });

  it("L11: no delete action is offered anywhere in the list — the API has no DELETE route", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000001"]));
    render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
  });

  it("L12: 'Configurar deslocamento' opens the travel-fee settings dialog", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<ServiceOrderList />);
    await screen.findByText("Nenhuma O.S. ainda");

    await user.click(screen.getByRole("button", { name: /configurar deslocamento/i }));

    await screen.findByText(/preenchida automaticamente/i);
  });

  it("L13: renders a 'Nova O.S.' link pointing at the wizard route", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    const { container } = render(<ServiceOrderList />);
    await screen.findByText("Nenhuma O.S. ainda");
    expect(container.querySelector('a[href="/ordens-servico/nova"]')).toBeInTheDocument();
  });

  it("L14: search debounces and resets to page 1", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page(["OS-000001"]));
    const user = userEvent.setup();
    render(<ServiceOrderList />);
    await screen.findAllByText("OS-000001");

    await user.type(screen.getByLabelText(/buscar ordens de serviço/i), "reparo");

    await waitFor(
      () => {
        const lastCall = vi.mocked(listServiceOrders).mock.calls.at(-1)![0];
        expect(lastCall.search).toBe("reparo");
        expect(lastCall.page).toBe(1);
      },
      { timeout: 2000 }
    );
  });

  it("L15: a stale error for the old tenant never flashes once a new tenant is active", async () => {
    let resolveB!: (value: ServiceOrderPaginationResponse) => void;
    const bPromise = new Promise<ServiceOrderPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listServiceOrders).mockRejectedValueOnce(new Error("network")).mockReturnValueOnce(bPromise);

    const { rerender } = render(<ServiceOrderList />);
    await screen.findByRole("alert");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    // The error resolved for Company A must not render once Company B
    // is active — even before B's own request has resolved.
    expect(screen.queryByText(/não foi possível carregar as ordens de serviço/i)).not.toBeInTheDocument();

    resolveB(page(["OS-000002"]));
    await screen.findAllByText("OS-000002");
  });

  it("OT12: switching company closes the travel-fee settings dialog", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "25.00" });
    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderList />);
    await screen.findByText("Nenhuma O.S. ainda");

    await user.click(screen.getByRole("button", { name: /configurar deslocamento/i }));
    await screen.findByText(/preenchida automaticamente/i);

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    await waitFor(() => expect(screen.queryByText(/preenchida automaticamente/i)).not.toBeInTheDocument());
  });

  it("OT13: a late settings GET for the old tenant never populates the dialog under the new tenant", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    let resolveSettings!: (value: { default_travel_fee: string }) => void;
    vi.mocked(getServiceOrderSettings).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSettings = resolve;
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderList />);
    await screen.findByText("Nenhuma O.S. ainda");

    await user.click(screen.getByRole("button", { name: /configurar deslocamento/i }));
    await screen.findByText("Carregando...");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);

    resolveSettings({ default_travel_fee: "99.00" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The dialog closed on the switch and stays closed — the old
    // tenant's late GET never reopens it or populates anything visible.
    expect(screen.queryByText(/preenchida automaticamente/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/taxa padrão de deslocamento/i)).not.toBeInTheDocument();
  });

  it("OT14: a late settings PUT for the old tenant never alters the UI under the new tenant", async () => {
    vi.mocked(listServiceOrders).mockResolvedValue(page([]));
    vi.mocked(getServiceOrderSettings).mockResolvedValue({ default_travel_fee: "10.00" });
    let resolveUpdate!: () => void;
    vi.mocked(updateServiceOrderSettings).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = () => resolve({ default_travel_fee: "10.00" } as never);
      })
    );
    const user = userEvent.setup();
    const { rerender } = render(<ServiceOrderList />);
    await screen.findByText("Nenhuma O.S. ainda");

    await user.click(screen.getByRole("button", { name: /configurar deslocamento/i }));
    await screen.findByLabelText(/taxa padrão de deslocamento/i);
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<ServiceOrderList />);
    await waitFor(() => expect(screen.queryByText(/preenchida automaticamente/i)).not.toBeInTheDocument());

    resolveUpdate();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The dialog stays closed (it was already closed by the switch) —
    // the stale PUT never reopens it or otherwise implies success under
    // the new tenant.
    expect(screen.queryByText(/preenchida automaticamente/i)).not.toBeInTheDocument();
  });
});
