import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditBudgetHeaderForm } from "../edit-budget-header-form";
import { ApiError, ApiValidationError } from "@/lib/api-client";
import type { Budget } from "../types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => authState,
}));

vi.mock("../budgets-client", () => ({
  getBudget: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock("@/features/customers/customers-client", () => ({
  listCustomers: vi.fn().mockResolvedValue({
    data: [],
    meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
    links: { first: null, last: null, prev: null, next: null },
  }),
}));

import { getBudget, updateBudget } from "../budgets-client";

function draftBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    number: "ORC-000001",
    status: "draft",
    customer_id: "cust-1",
    title: "Reforma",
    reference: "Casa de praia",
    notes: null,
    valid_until: null,
    payment_terms: null,
    execution_terms: null,
    proposal_terms: null,
    customer: { name: "Maria Cliente", document: "12345678900", phone: null, email: null },
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
});

describe("EditBudgetHeaderForm", () => {
  it("ET1/§36: loads the draft header and submits a full PUT with the 4 header fields", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    vi.mocked(updateBudget).mockResolvedValue(draftBudget({ title: "Reforma total" }));
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());

    await user.clear(screen.getByLabelText("Título"));
    await user.type(screen.getByLabelText("Título"), "Reforma total");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateBudget).toHaveBeenCalledTimes(1));
    expect(updateBudget).toHaveBeenCalledWith(
      "budget-1",
      expect.objectContaining({ customer_id: "cust-1", title: "Reforma total", reference: "Casa de praia" })
    );
    expect(push).toHaveBeenCalledWith("/orcamentos/budget-1");
  });

  it("§37: blocks editing a pending_approval budget with zero PUT", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ status: "pending_approval" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() =>
      expect(
        screen.getByText("Este orçamento já foi disponibilizado e não pode mais ser editado.")
      ).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
    expect(updateBudget).not.toHaveBeenCalled();
  });

  it("§37: blocks editing an approved budget with zero PUT", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ status: "approved" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() =>
      expect(
        screen.getByText("Este orçamento já foi disponibilizado e não pode mais ser editado.")
      ).toBeInTheDocument()
    );
    expect(updateBudget).not.toHaveBeenCalled();
  });

  it("§39: a 409 on PUT refetches and shows the can-no-longer-be-edited message", async () => {
    vi.mocked(getBudget)
      .mockResolvedValueOnce(draftBudget())
      .mockResolvedValueOnce(draftBudget({ status: "pending_approval" }));
    vi.mocked(updateBudget).mockRejectedValue(new ApiError(409, "conflict"));
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("O orçamento foi alterado e não pode mais ser editado.")).toBeInTheDocument());
    expect(getBudget).toHaveBeenCalledTimes(2);
  });

  it("maps 422 field errors onto the corresponding field", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    vi.mocked(updateBudget).mockRejectedValue(new ApiValidationError({ title: ["Título inválido"] }));
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Título inválido")).toBeInTheDocument());
  });

  it("ET5: shows 'Orçamento não encontrado' on a 404", async () => {
    vi.mocked(getBudget).mockRejectedValue(new ApiError(404, "not found"));
    render(<EditBudgetHeaderForm id="missing" />);

    await waitFor(() => expect(screen.getByText("Orçamento não encontrado")).toBeInTheDocument());
  });

  it("ET6: shows a generic error + retry on a non-404 load failure, and retry re-fetches", async () => {
    vi.mocked(getBudget).mockRejectedValueOnce(new Error("network down"));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByText("Não foi possível carregar este orçamento.")).toBeInTheDocument());

    vi.mocked(getBudget).mockResolvedValueOnce(draftBudget());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
  });

  it("ET7/§79: discards a stale PUT success response after a company switch mid-request", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    let resolveUpdate: (value: Budget) => void = () => {};
    vi.mocked(updateBudget).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);
    resolveUpdate(draftBudget());

    await waitFor(() => expect(updateBudget).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("ET8: a stale PUT error for A after switching to B never surfaces under B, and B's own submitting state is untouched", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    let rejectUpdate: (reason: unknown) => void = () => {};
    vi.mocked(updateBudget).mockImplementation(
      () => new Promise((_resolve, reject) => { rejectUpdate = reject; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);
    rejectUpdate(new Error("network down"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Não foi possível salvar. Verifique sua conexão e tente novamente.")).not.toBeInTheDocument();
    // B's own instance re-loaded fresh and is not stuck in a submitting state.
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument());
  });

  // ================= ET2-ET4 (FRONTEND-BUDGETS-01A §13-18) — visual tenant fail-closed =================

  /** ET2: switching from A to B hides Company A's loaded form immediately — the skeleton takes over in the same render. */
  it("ET2: switching to Company B immediately hides Company A's loaded form", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());

    // Company B's own GET never resolves in this test — we only care
    // that A's values disappear the instant the switch happens.
    vi.mocked(getBudget).mockImplementation(() => new Promise(() => {}));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);

    expect(screen.queryByDisplayValue("Reforma")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  /** ET3: a late GET for A that resolves after switching to B is discarded — never overwrites B's own loaded budget. */
  it("ET3: a late GET for Company A is discarded after switching to B", async () => {
    let resolveGetA: (value: Budget) => void = () => {};
    vi.mocked(getBudget).mockReturnValueOnce(new Promise((resolve) => { resolveGetA = resolve; }));
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    vi.mocked(getBudget).mockResolvedValueOnce(draftBudget({ title: "Orçamento da Empresa B" }));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Orçamento da Empresa B")).toBeInTheDocument());

    // A's GET resolves only now, after B has already loaded successfully.
    resolveGetA(draftBudget({ title: "Orçamento da Empresa A" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByDisplayValue("Orçamento da Empresa A")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Orçamento da Empresa B")).toBeInTheDocument();
  });

  /** ET4: a late error for A's GET resolving after switching to B never renders under B. */
  it("ET4: a late error for Company A's GET is discarded after switching to B", async () => {
    let rejectGetA: (reason: unknown) => void = () => {};
    vi.mocked(getBudget).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectGetA = reject; }));
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    vi.mocked(getBudget).mockResolvedValueOnce(draftBudget());
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());

    rejectGetA(new Error("network down"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("Não foi possível carregar este orçamento.")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument();
  });

  // ================= ER1-ER4 (FRONTEND-BUDGETS-01A1 §13-14/§20) — PUT live-ref exact race =================
  // §13: activeCompanyIdRef now updates via useLayoutEffect (synchronous,
  // pre-paint) instead of useEffect, so a PUT for A resolving in the very
  // same tick a switch to B commits can never read a stale `.current`.

  /** ER1: PUT A success resolved immediately after the B commit never navigates. */
  it("ER1: a PUT A resolving in the exact tick after switching to B never navigates", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    let resolveUpdate: (value: Budget) => void = () => {};
    vi.mocked(updateBudget).mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    // Switch to B and resolve A's in-flight PUT in the SAME synchronous
    // block, before any further await gives an effect a chance to run —
    // this is the exact race the useLayoutEffect fix targets.
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);
    resolveUpdate(draftBudget());

    await waitFor(() => expect(updateBudget).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  /** ER2: PUT A error resolved in the exact same tick never surfaces as an error under B. */
  it("ER2: a PUT A error resolving in the exact tick after switching to B never appears", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    let rejectUpdate: (reason: unknown) => void = () => {};
    vi.mocked(updateBudget).mockImplementation(
      () => new Promise((_resolve, reject) => { rejectUpdate = reject; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);
    rejectUpdate(new ApiError(500, "boom"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível salvar as alterações.")).not.toBeInTheDocument();
  });

  /** ER3: A's `finally` (submitting=false) never touches B's own, independent submitting state. */
  it("ER3: A's finally block never alters B's own submitting state", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    let resolveUpdateA: (value: Budget) => void = () => {};
    vi.mocked(updateBudget).mockImplementationOnce(
      () => new Promise((resolve) => { resolveUpdateA = resolve; })
    );
    const user = userEvent.setup();
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());

    // B independently starts its own PUT — must be a real, non-disabled submit.
    let resolveUpdateB: (value: Budget) => void = () => {};
    vi.mocked(updateBudget).mockImplementationOnce(
      () => new Promise((resolve) => { resolveUpdateB = resolve; })
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();

    // A's PUT resolves late — its `finally` must not flip B's submitting off mid-flight.
    resolveUpdateA(draftBudget());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();

    resolveUpdateB(draftBudget());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orcamentos/budget-1"));
  });

  /** ER4: B keeps resolving its OWN skeleton/not-found/error strictly from its own request — already covered by ET2-ET4, restated here under the ER numbering for FRONTEND-BUDGETS-01A1 traceability. */
  it("ER4: Company B's own load outcome (not A's) governs what B renders", async () => {
    vi.mocked(getBudget).mockRejectedValueOnce(new ApiError(404, "not found"));
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByText("Orçamento não encontrado")).toBeInTheDocument());

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    vi.mocked(getBudget).mockResolvedValueOnce(draftBudget({ title: "Orçamento B" }));
    rerender(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Orçamento B")).toBeInTheDocument());
    expect(screen.queryByText("Orçamento não encontrado")).not.toBeInTheDocument();
  });

  // ================= EC1-EC10 (PROPOSAL-DOC-01B §70) — edit conditions =================

  /** EC1: hydrates valid_until from the loaded Budget. */
  it("EC1: hydrates valid_until from the loaded Budget", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ valid_until: "2026-10-01" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Validade/)).toHaveValue("2026-10-01"));
  });

  /** EC2: hydrates payment_terms. */
  it("EC2: hydrates payment_terms from the loaded Budget", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ payment_terms: "50% na aprovação" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Condições de pagamento/)).toHaveValue("50% na aprovação"));
  });

  /** EC3: hydrates execution_terms. */
  it("EC3: hydrates execution_terms from the loaded Budget", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ execution_terms: "10 dias úteis" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Prazo e condições de execução/)).toHaveValue("10 dias úteis"));
  });

  /** EC4: hydrates proposal_terms. */
  it("EC4: hydrates proposal_terms from the loaded Budget", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ proposal_terms: "Condição geral" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Condições gerais/)).toHaveValue("Condição geral"));
  });

  /** EC5: saves all four conditions fields together with the existing header fields. */
  it("EC5: saves all four conditions fields in the same PUT as the header fields", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    vi.mocked(updateBudget).mockResolvedValue(draftBudget());
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.type(screen.getByLabelText(/Validade/), "2026-11-15");
    await user.type(screen.getByLabelText(/Condições de pagamento/), "50/50");
    await user.type(screen.getByLabelText(/Prazo e condições de execução/), "15 dias");
    await user.type(screen.getByLabelText(/Condições gerais/), "Geral");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateBudget).toHaveBeenCalledWith(
        "budget-1",
        expect.objectContaining({
          valid_until: "2026-11-15",
          payment_terms: "50/50",
          execution_terms: "15 dias",
          proposal_terms: "Geral",
        })
      )
    );
  });

  /** EC6: clearing a previously-set condition sends null, not an empty string. */
  it("EC6: clearing a previously-set condition sends null", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ payment_terms: "50% na aprovação" }));
    vi.mocked(updateBudget).mockResolvedValue(draftBudget());
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Condições de pagamento/)).toHaveValue("50% na aprovação"));
    await user.clear(screen.getByLabelText(/Condições de pagamento/));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateBudget).toHaveBeenCalledWith("budget-1", expect.objectContaining({ payment_terms: null }))
    );
  });

  /** EC7: a 422 on a condition field maps onto that field's error. */
  it("EC7: a 422 on execution_terms maps to that field's error", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget());
    vi.mocked(updateBudget).mockRejectedValue(new ApiValidationError({ execution_terms: ["Texto muito longo."] }));
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Reforma")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("Texto muito longo.")).toBeInTheDocument());
  });

  /** EC8: a 409 mid-edit (already covered generically by the existing §39 test) leaves conditions unsent — readonly block, zero PUT retried automatically. */
  it("EC8: a 409 shows the readonly conflict message without an automatic retry PUT", async () => {
    vi.mocked(getBudget)
      .mockResolvedValueOnce(draftBudget({ payment_terms: "50/50" }))
      .mockResolvedValueOnce(draftBudget({ status: "pending_approval", payment_terms: "50/50" }));
    vi.mocked(updateBudget).mockRejectedValue(new ApiError(409, "conflict"));
    const user = userEvent.setup();
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Condições de pagamento/)).toHaveValue("50/50"));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText("O orçamento foi alterado e não pode mais ser editado.")).toBeInTheDocument());
    expect(updateBudget).toHaveBeenCalledTimes(1);
  });

  /** EC9: direct access to a pending_approval Budget's edit route never renders the conditions inputs, and issues zero PUT. */
  it("EC9: pending_approval direct access shows readonly, zero conditions inputs, zero PUT", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ status: "pending_approval", payment_terms: "50/50" }));
    render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() =>
      expect(screen.getByText("Este orçamento já foi disponibilizado e não pode mais ser editado.")).toBeInTheDocument()
    );
    expect(screen.queryByLabelText(/Condições de pagamento/)).not.toBeInTheDocument();
    expect(updateBudget).not.toHaveBeenCalled();
  });

  /** EC10: the existing tenant-switch guards (ET2-ET4) already prove the conditions fields reset the same as every other field on a Company switch — this restates that under the EC numbering for traceability. */
  it("EC10: a Company switch clears loaded conditions the same as every other field", async () => {
    vi.mocked(getBudget).mockResolvedValue(draftBudget({ payment_terms: "50/50" }));
    const { rerender } = render(<EditBudgetHeaderForm id="budget-1" />);

    await waitFor(() => expect(screen.getByLabelText(/Condições de pagamento/)).toHaveValue("50/50"));

    vi.mocked(getBudget).mockImplementation(() => new Promise(() => {}));
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<EditBudgetHeaderForm id="budget-1" />);

    expect(screen.queryByLabelText(/Condições de pagamento/)).not.toBeInTheDocument();
  });
});
