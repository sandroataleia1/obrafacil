import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BudgetForm } from "../budget-form";
import { ApiValidationError } from "@/lib/api-client";
import { clearPendingBudgetItem, setPendingBudgetItem } from "../prototype/pending-budget-item";
import type { Budget } from "../types";

const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../budgets-client", () => ({
  createBudget: vi.fn(),
}));

vi.mock("@/features/customers/customers-client", () => ({
  listCustomers: vi.fn(),
  getCustomer: vi.fn(),
}));

import { createBudget } from "../budgets-client";
import { getCustomer, listCustomers } from "@/features/customers/customers-client";

const CUSTOMER = {
  id: "cust-1",
  kind: "individual" as const,
  name: "Maria Cliente",
  legal_name: null,
  trade_name: null,
  document: "12345678900",
  phone: "+5511999999999",
  email: null,
  active: true,
  primary_address: null,
  primary_contact: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const CREATED_BUDGET: Budget = {
  id: "budget-1",
  number: "ORC-000001",
  status: "draft",
  customer_id: "cust-1",
  title: "Reforma",
  reference: null,
  notes: null,
  customer: { name: "Maria Cliente", document: null, phone: null, email: null },
  sale_subtotal: "0.00",
  cost_subtotal: null,
  margin_amount: null,
  margin_percentage: null,
  discount_amount: "0.00",
  total: "0.00",
  proposal_token: null,
  submitted_at: null,
  decision_source: null,
  decision_by_user_id: null,
  decision_by_name: null,
  decision_note: null,
  decided_at: null,
  items: [],
  created_by_user_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  clearPendingBudgetItem();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
  vi.mocked(listCustomers).mockResolvedValue({
    data: [CUSTOMER],
    meta: { current_page: 1, from: 1, last_page: 1, per_page: 15, to: 1, total: 1 },
    links: { first: null, last: null, prev: null, next: null },
  });
});

async function selectCustomer(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Buscar cliente"), "Maria");
  await waitFor(() => expect(screen.getByText("Maria Cliente")).toBeInTheDocument(), { timeout: 2000 });
  await user.click(screen.getByText("Maria Cliente"));
}

describe("BudgetForm (create)", () => {
  it("BC1: creates an empty budget with no items and navigates on success", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);

    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(createBudget).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: "cust-1", title: "Reforma", items: [] })
    );
    expect(push).toHaveBeenCalledWith("/orcamentos/budget-1");
  });

  it("BC2: never sends project_id, status, number, or snapshot fields", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createBudget).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("project_id");
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("number");
    expect(payload).not.toHaveProperty("sale_subtotal");
    expect(payload).not.toHaveProperty("margin_percentage");
  });

  it("BC3: double-submit protection — exactly one POST while creating", async () => {
    let resolveCreate: (value: Budget) => void = () => {};
    vi.mocked(createBudget).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);

    const submitButton = screen.getByRole("button", { name: "Criar orçamento" });
    await user.click(submitButton);
    expect(screen.getByRole("button", { name: "Criando..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Criando..." }));

    expect(createBudget).toHaveBeenCalledTimes(1);
    resolveCreate(CREATED_BUDGET);
  });

  it("BC4: maps 422 field errors to the title field", async () => {
    vi.mocked(createBudget).mockRejectedValue(new ApiValidationError({ title: ["Título inválido"] }));
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(screen.getByText("Título inválido")).toBeInTheDocument());
  });

  it("CH1: includes a calculator handoff item atomically in the same POST", async () => {
    setPendingBudgetItem({
      source: "masonry",
      title: "Parede externa",
      materialId: "mat-1",
      materialName: "Bloco cerâmico",
      quantity: 500,
      unit: "un",
      netAreaM2: 20,
      wastePercentage: 10,
      auxiliaryMaterials: { cementBags: 5, limeBags: 2, sandM3: 1 },
    });
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    expect(screen.getByText("Parede externa")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Preço de venda deste item"), "500,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createBudget).mock.calls[0]![0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items?.[0]).toMatchObject({
      source_type: "calculator",
      calculator_type: "masonry",
      name: "Parede externa",
      quantity: "1.000",
      unit: null,
      unit_cost: null,
      unit_price: "500.00",
    });
    expect(payload.items?.[0]?.calculation_snapshot).toMatchObject({ source: "masonry", title: "Parede externa" });
  });

  it("CH2: clears the pending handoff only after a successful create", async () => {
    setPendingBudgetItem({
      source: "floor",
      title: "Piso sala",
      areaM2: 10,
      wastePercentage: 5,
      coveragePerBoxM2: 2,
      boxes: 6,
    });
    vi.mocked(createBudget).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    const { unmount } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Preço de venda deste item"), "300,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    unmount();

    // The handoff must survive the failed attempt.
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    render(<BudgetForm />);
    expect(screen.getByText("Piso sala")).toBeInTheDocument();
  });

  it("CH3: 'Remover item do cálculo' drops the calculator item and allows an empty create", async () => {
    setPendingBudgetItem({
      source: "floor",
      title: "Piso sala",
      areaM2: 10,
      wastePercentage: 5,
      coveragePerBoxM2: 2,
      boxes: 6,
    });
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.click(screen.getByRole("button", { name: "Remover item do cálculo" }));
    expect(screen.queryByText("Piso sala")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBudget).mock.calls[0]![0].items).toEqual([]);
  });

  it("§23: preselects a customer from ?customerId=", async () => {
    searchParams = new URLSearchParams({ customerId: "cust-1" });
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, addresses: [], contacts: [] } as never);
    render(<BudgetForm />);

    await waitFor(() => expect(screen.getByText("Maria Cliente")).toBeInTheDocument());
  });

  it("§23: shows an error and never uses a not-found preselected customer silently", async () => {
    searchParams = new URLSearchParams({ customerId: "does-not-exist" });
    vi.mocked(getCustomer).mockRejectedValue(new Error("404"));
    render(<BudgetForm />);

    await waitFor(() =>
      expect(screen.getByText("Não foi possível carregar o cliente selecionado. Escolha um cliente abaixo.")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Criar orçamento" })).toBeDisabled();
  });

  it("§79: discards a create response after the active company changed mid-request", async () => {
    let resolveCreate: (value: Budget) => void = () => {};
    vi.mocked(createBudget).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);
    resolveCreate(CREATED_BUDGET);

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });
});
