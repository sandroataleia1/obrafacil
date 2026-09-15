import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BudgetForm } from "../budget-form";
import { ApiValidationError } from "@/lib/api-client";
import { clearPendingBudgetItem, getPendingBudgetItem, setPendingBudgetItem } from "../prototype/pending-budget-item";
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
  valid_until: null,
  payment_terms: null,
  execution_terms: null,
  proposal_terms: null,
  customer: { name: "Maria Cliente", document: null, phone: null, email: null },
  sale_subtotal: "0.00",
  cost_subtotal: null,
  margin_amount: null,
  margin_percentage: null,
  discount_amount: "0.00",
  total: "0.00",
  proposal_token: null,
  submitted_at: null,
  proposal_template_version: null,
  proposal_company: null,
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
  clearPendingBudgetItem("company-a");
  clearPendingBudgetItem("company-b");
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
    setPendingBudgetItem("company-a", {
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
    setPendingBudgetItem("company-a", {
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
    setPendingBudgetItem("company-a", {
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

  it("CH4: a successful create consumes exactly the handoff that was used", async () => {
    setPendingBudgetItem("company-a", {
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

    await user.type(screen.getByLabelText("Preço de venda deste item"), "300,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/orcamentos/budget-1"));
    expect(getPendingBudgetItem("company-a")).toBeNull();
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

  it("§79/BT6: discards a create response after the active company changed mid-request", async () => {
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

  // ================= BT1-BT8 (FRONTEND-BUDGETS-01A §1-4/§22) — tenant draft isolation =================

  /** BT1: a draft's title disappears immediately on a Company switch — no stale frame. */
  it("BT1: draft A disappears immediately under Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma da Empresa A");
    expect(screen.getByLabelText("Título")).toHaveValue("Reforma da Empresa A");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    expect(screen.getByLabelText("Título")).toHaveValue("");
  });

  /** BT2: a selected Customer under A never renders under B. */
  it("BT2: selected Customer A no longer appears under Company B", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await selectCustomer(user);
    expect(screen.getByText("Cliente selecionado")).toBeInTheDocument();
    expect(screen.getByText("Maria Cliente")).toBeInTheDocument();

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    expect(screen.queryByText("Cliente selecionado")).not.toBeInTheDocument();
    expect(screen.queryByText("Maria Cliente")).not.toBeInTheDocument();
  });

  /** BT3: title/reference/notes/discount are all reset on a switch. */
  it("BT3: title/reference/notes/discount are all reset on a Company switch", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Título A");
    await user.type(screen.getByLabelText(/Referência/), "Referência A");
    await user.type(screen.getByLabelText(/Observações/), "Notas A");
    await user.type(screen.getByLabelText(/Desconto global/), "50,00");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText(/Referência/)).toHaveValue("");
    expect(screen.getByLabelText(/Observações/)).toHaveValue("");
    expect(screen.getByLabelText(/Desconto global/)).toHaveValue("");
  });

  /** BT4: a resolved preselected Customer A never survives a switch to B. */
  it("BT4: preselected Customer A does not remain selected under Company B", async () => {
    searchParams = new URLSearchParams({ customerId: "cust-1" });
    vi.mocked(getCustomer).mockResolvedValue({ ...CUSTOMER, addresses: [], contacts: [] } as never);
    const { rerender } = render(<BudgetForm />);

    await waitFor(() => expect(screen.getByText("Maria Cliente")).toBeInTheDocument());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    expect(screen.queryByText("Maria Cliente")).not.toBeInTheDocument();
  });

  /** BT5: a preselect GET for A that resolves AFTER switching to B is discarded, never applied under B. */
  it("BT5: a late preselect GET for Company A is discarded after switching to B", async () => {
    searchParams = new URLSearchParams({ customerId: "cust-1" });
    let resolveGetCustomer: (value: Awaited<ReturnType<typeof getCustomer>>) => void = () => {};
    vi.mocked(getCustomer).mockImplementation(
      () => new Promise((resolve) => { resolveGetCustomer = resolve; })
    );
    const { rerender } = render(<BudgetForm />);

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    resolveGetCustomer({ ...CUSTOMER, addresses: [], contacts: [] } as never);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Maria Cliente")).not.toBeInTheDocument();
  });

  /** BT7: a create error for A resolving after a switch to B never surfaces under B. */
  it("BT7: a create error for A after switching to B never appears under B", async () => {
    let rejectCreate: (reason: unknown) => void = () => {};
    vi.mocked(createBudget).mockImplementation(
      () => new Promise((_resolve, reject) => { rejectCreate = reject; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);
    rejectCreate(new Error("network down"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Não foi possível criar o orçamento. Verifique sua conexão e tente novamente.")).not.toBeInTheDocument();
  });

  /** BT8: the fresh instance under B starts on every field's true default — not just title/customer. */
  it("BT8: form B starts completely clean on every field", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Título A");
    await selectCustomer(user);
    await user.type(screen.getByLabelText(/Referência/), "Referência A");
    await user.type(screen.getByLabelText(/Observações/), "Notas A");
    await user.type(screen.getByLabelText(/Desconto global/), "50,00");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText(/Referência/)).toHaveValue("");
    expect(screen.getByLabelText(/Observações/)).toHaveValue("");
    expect(screen.getByLabelText(/Desconto global/)).toHaveValue("");
    expect(screen.queryByText("Cliente selecionado")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar orçamento" })).toBeDisabled();
  });

  // ============ HT9/§10 — a REAL integration test through BudgetForm itself ============
  // (FRONTEND-BUDGETS-01A1 §10: the original HT9 only called
  // clearPendingBudgetItem directly — it never exercised BudgetForm at
  // all. This drives the actual component: handoff A exists, BudgetForm A
  // mounts, its POST is left pending, the user switches to Company B
  // (rerender), THEN the A POST resolves 201.)

  /** HT9 (real): a stale-success POST for A never navigates/renders under B, but still consumes A's own handoff — and never touches B's. */
  it("HT9 (integration): a stale 201 for Company A consumes A's handoff, never pushes under B, and leaves B's handoff untouched", async () => {
    setPendingBudgetItem("company-a", {
      source: "floor",
      title: "Piso A",
      areaM2: 10,
      wastePercentage: 5,
      coveragePerBoxM2: 2,
      boxes: 6,
    });
    setPendingBudgetItem("company-b", {
      source: "slab",
      title: "Laje B",
      slabTypeLabel: "Maciça",
      areaM2: 12,
      thicknessCm: 10,
      wastePercentage: 8,
      concreteVolumeM3: 1.2,
      concreteVolumeWithWasteM3: 1.3,
      fillingName: "-",
      fillingUnits: 0,
      cementBags: 6,
      sandM3: 0.5,
      gravelM3: 0.6,
    });

    let resolveCreate: (value: Budget) => void = () => {};
    vi.mocked(createBudget).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<BudgetForm />);

    await user.type(screen.getByLabelText("Preço de venda deste item"), "300,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    // Switch to Company B WHILE the A POST is still in flight.
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetForm />);

    // Now the A POST resolves 201.
    resolveCreate(CREATED_BUDGET);
    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Never navigated (would have pointed at a Budget created for the
    // Company the user has since left).
    expect(push).not.toHaveBeenCalled();
    // A's handoff was still consumed — business success happened.
    expect(getPendingBudgetItem("company-a")).toBeNull();
    // B's own, unrelated handoff was never touched by A's resolution.
    expect(getPendingBudgetItem("company-b")).toEqual(
      expect.objectContaining({ source: "slab", title: "Laje B" })
    );
  });

  /** §7/HC4 through the real component: a NEW handoff A2 created after the A1 POST began must survive A1's later 201. */
  it("integration: a newer handoff for the SAME company survives a stale POST resolving with the old one", async () => {
    setPendingBudgetItem("company-a", {
      source: "floor",
      title: "Piso A1",
      areaM2: 10,
      wastePercentage: 5,
      coveragePerBoxM2: 2,
      boxes: 6,
    });

    let resolveCreate: (value: Budget) => void = () => {};
    vi.mocked(createBudget).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Preço de venda deste item"), "300,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    // A NEW calculator result for company-a replaces the handoff in
    // storage while the POST that used A1 is still in flight — this
    // simulates the user opening a second tab / going back to a
    // calculator for the SAME company before the first request settles.
    setPendingBudgetItem("company-a", {
      source: "floor",
      title: "Piso A2",
      areaM2: 20,
      wastePercentage: 5,
      coveragePerBoxM2: 2,
      boxes: 12,
    });

    resolveCreate(CREATED_BUDGET);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orcamentos/budget-1"));

    expect(getPendingBudgetItem("company-a")).toEqual(
      expect.objectContaining({ title: "Piso A2" })
    );
  });

  // ================= CC1-CC10 (PROPOSAL-DOC-01B §69) — create conditions =================

  /** CC1: leaving all four condition fields blank sends null for each, never empty strings. */
  it("CC1: blank conditions send null, never empty strings", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createBudget).mock.calls[0]![0];
    expect(payload.valid_until).toBeNull();
    expect(payload.payment_terms).toBeNull();
    expect(payload.execution_terms).toBeNull();
    expect(payload.proposal_terms).toBeNull();
  });

  /** CC2: the date input sends a plain "YYYY-MM-DD" string, never a Date/ISO instant. */
  it("CC2: valid_until is sent as a plain YYYY-MM-DD string", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    const dateInput = screen.getByLabelText(/Validade/);
    await user.type(dateInput, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createBudget).mock.calls[0]![0];
    expect(payload.valid_until).toBe("2026-10-01");
  });

  /** CC3: payment_terms is sent trimmed. */
  it("CC3: payment_terms is sent trimmed", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.type(screen.getByLabelText(/Condições de pagamento/), "  50% na aprovação  ");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBudget).mock.calls[0]![0].payment_terms).toBe("50% na aprovação");
  });

  /** CC4: execution_terms is sent trimmed. */
  it("CC4: execution_terms is sent trimmed", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.type(screen.getByLabelText(/Prazo e condições de execução/), "10 dias úteis");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBudget).mock.calls[0]![0].execution_terms).toBe("10 dias úteis");
  });

  /** CC5: proposal_terms is sent trimmed. */
  it("CC5: proposal_terms is sent trimmed", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.type(screen.getByLabelText(/Condições gerais/), "Materiais extras à parte");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBudget).mock.calls[0]![0].proposal_terms).toBe("Materiais extras à parte");
  });

  /** CC6: notes remains a wholly separate field from the four conditions. */
  it("CC6: notes stays a separate field from the four proposal conditions", async () => {
    vi.mocked(createBudget).mockResolvedValue(CREATED_BUDGET);
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.type(screen.getByLabelText(/Observações internas/), "Nota interna");
    await user.type(screen.getByLabelText(/Condições gerais/), "Condição pública");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(createBudget).mock.calls[0]![0];
    expect(payload.notes).toBe("Nota interna");
    expect(payload.proposal_terms).toBe("Condição pública");
  });

  /** CC7: the notes field is labeled "Observações internas" with a helper explaining it's never client-facing. */
  it("CC7: notes field is labeled 'Observações internas' with the privacy helper text", () => {
    render(<BudgetForm />);

    expect(screen.getByLabelText(/Observações internas/)).toBeInTheDocument();
    expect(
      screen.getByText("Visível somente para sua equipe. Não aparece na proposta do cliente.")
    ).toBeInTheDocument();
  });

  /** CC8: a 422 on valid_until maps to that field. */
  it("CC8: a 422 on valid_until maps to that field's error", async () => {
    vi.mocked(createBudget).mockRejectedValue(new ApiValidationError({ valid_until: ["Data inválida."] }));
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(screen.getByText("Data inválida.")).toBeInTheDocument());
  });

  /** CC9: a 422 on a condition field (e.g. payment_terms) maps to that field's error. */
  it("CC9: a 422 on payment_terms maps to that field's error", async () => {
    vi.mocked(createBudget).mockRejectedValue(
      new ApiValidationError({ payment_terms: ["Texto muito longo."] })
    );
    const user = userEvent.setup();
    render(<BudgetForm />);

    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(screen.getByText("Texto muito longo.")).toBeInTheDocument());
  });

  /** CC10: the calculator handoff atomic-create regression still works alongside the new conditions fields. */
  it("CC10: calculator handoff create still works unchanged with the conditions section present", async () => {
    setPendingBudgetItem("company-a", {
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

    await user.type(screen.getByLabelText("Preço de venda deste item"), "500,00");
    await user.type(screen.getByLabelText("Título"), "Reforma");
    await selectCustomer(user);
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));

    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createBudget).mock.calls[0]![0].items).toHaveLength(1);
  });
});
