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
    customer: { name: "Maria Cliente", document: "12345678900", phone: null, email: null },
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeCompany = { id: "company-a", name: "Empresa A" };
});

describe("EditBudgetHeaderForm", () => {
  it("§36: loads the draft header and submits a full PUT with the 4 header fields", async () => {
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

  it("shows 'Orçamento não encontrado' on a 404", async () => {
    vi.mocked(getBudget).mockRejectedValue(new ApiError(404, "not found"));
    render(<EditBudgetHeaderForm id="missing" />);

    await waitFor(() => expect(screen.getByText("Orçamento não encontrado")).toBeInTheDocument());
  });

  it("§79: discards a stale PUT response after a company switch mid-request", async () => {
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
});
