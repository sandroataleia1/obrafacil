import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { ServiceOrderDetail } from "../service-order-detail";
import type { ServiceOrder } from "../types";

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
}));

import { cancelServiceOrder, completeServiceOrder, getServiceOrder, startServiceOrder } from "../service-orders-client";

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
});
