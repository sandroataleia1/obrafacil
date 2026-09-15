import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-client";
import { BudgetDetail } from "../budget-detail";
import type { Budget, BudgetItem } from "../types";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
);

const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState }),
}));

vi.mock("../budgets-client", () => ({
  getBudget: vi.fn(),
  submitBudget: vi.fn(),
  approveBudgetManually: vi.fn(),
  rejectBudgetManually: vi.fn(),
  addBudgetItem: vi.fn(),
  updateBudgetItem: vi.fn(),
  deleteBudgetItem: vi.fn(),
}));

vi.mock("@/features/catalog/catalog-client", () => ({
  listCatalogItems: vi.fn(),
}));

import { listCatalogItems } from "@/features/catalog/catalog-client";
import { addBudgetItem, getBudget } from "../budgets-client";

const emptyCatalogPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

function catalogItem() {
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
  };
}

function budgetItem(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id: "item-1",
    source_type: "catalog",
    catalog_item_id: "cat-1",
    type: "product",
    calculator_type: null,
    code: "PROD-1",
    name: "Cimento CP-II",
    unit: "sc",
    description: null,
    quantity: "1.000",
    unit_price: "30.00",
    unit_cost: "20.00",
    line_discount: "0.00",
    line_total: "30.00",
    line_cost_total: "20.00",
    calculation_snapshot: null,
    notes: null,
    sort_order: 0,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    number: "ORC-000001",
    status: "draft",
    customer_id: "cust-1",
    title: "Reforma cozinha",
    reference: null,
    notes: null,
    valid_until: null,
    payment_terms: null,
    execution_terms: null,
    proposal_terms: null,
    customer: { name: "Cliente Teste", document: null, phone: null, email: null },
    sale_subtotal: "0.00",
    cost_subtotal: "0.00",
    margin_amount: "0.00",
    margin_percentage: "0.00",
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
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("Budget item management", () => {
  beforeEach(() => {
    vi.mocked(getBudget).mockReset();
    vi.mocked(addBudgetItem).mockReset();
    vi.mocked(listCatalogItems).mockReset().mockResolvedValue(emptyCatalogPage);
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("the add-item choice never offers a Calculadora option", async () => {
    vi.mocked(getBudget).mockResolvedValue(budget());
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await screen.findByRole("heading", { name: "Adicionar item" });
    expect(screen.getByRole("button", { name: "Catálogo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Item manual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /calculadora/i })).not.toBeInTheDocument();
  });

  it("adding a catalog item builds the exact payload and triggers a full parent refetch for totals", async () => {
    vi.mocked(getBudget)
      .mockResolvedValueOnce(budget({ items: [] }))
      .mockResolvedValueOnce(budget({ sale_subtotal: "30.00", total: "30.00", items: [budgetItem()] }));
    vi.mocked(listCatalogItems).mockResolvedValue({ ...emptyCatalogPage, data: [catalogItem()] });
    vi.mocked(addBudgetItem).mockResolvedValue(budgetItem());
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await user.click(screen.getByRole("button", { name: "Catálogo" }));
    await user.type(screen.getByLabelText(/buscar produto ou serviço/i), "cimento");
    await screen.findByText("Cimento CP-II");
    await user.click(screen.getByRole("button", { name: "Selecionar" }));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(addBudgetItem).toHaveBeenCalledWith("budget-1", {
        source_type: "catalog",
        catalog_item_id: "cat-1",
        quantity: "1.000",
        unit_price: "30.00",
        line_discount: "0.00",
        notes: null,
      })
    );
    const catalogCall = vi.mocked(addBudgetItem).mock.calls[0]![1] as unknown as Record<string, unknown>;
    expect(catalogCall).not.toHaveProperty("unit_cost");
    expect(catalogCall).not.toHaveProperty("name");
    await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText((text) => text.includes("30,00")).length).toBeGreaterThan(0));
  });

  it("adding a catalog item does not require the search to be at least 3 characters before it fetches nothing", async () => {
    vi.mocked(getBudget).mockResolvedValue(budget());
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await user.click(screen.getByRole("button", { name: "Catálogo" }));
    await user.type(screen.getByLabelText(/buscar produto ou serviço/i), "ci");

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(listCatalogItems).not.toHaveBeenCalled();
  });

  it("adding a manual item with an empty cost sends unit_cost: null (never 0)", async () => {
    vi.mocked(getBudget)
      .mockResolvedValueOnce(budget({ items: [] }))
      .mockResolvedValueOnce(
        budget({ sale_subtotal: "50.00", total: "50.00", items: [budgetItem({ source_type: "manual", unit_cost: null, line_cost_total: null })] })
      );
    vi.mocked(addBudgetItem).mockResolvedValue(budgetItem({ source_type: "manual", unit_cost: null, line_cost_total: null }));
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await user.click(screen.getByRole("button", { name: "Item manual" }));

    await user.type(screen.getByLabelText("Nome"), "Serviço avulso");
    const qtyInput = screen.getByLabelText("Quantidade");
    await user.clear(qtyInput);
    await user.type(qtyInput, "1");
    await user.type(screen.getByLabelText("Preço unitário"), "50");
    // Custo unitário interno intentionally left empty.
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(addBudgetItem).toHaveBeenCalledWith("budget-1", {
        source_type: "manual",
        name: "Serviço avulso",
        quantity: "1.000",
        unit: null,
        unit_price: "50.00",
        unit_cost: null,
        line_discount: "0.00",
        description: null,
        notes: null,
      })
    );
    const manualCall = vi.mocked(addBudgetItem).mock.calls[0]![1] as { unit_cost: string | null };
    expect(manualCall.unit_cost).toBeNull();
    expect(manualCall.unit_cost).not.toBe("0.00");
    await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
  });

  it("shows the helper text about margin unavailability near the cost field", async () => {
    vi.mocked(getBudget).mockResolvedValue(budget());
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await user.click(screen.getByRole("button", { name: "Item manual" }));
    expect(screen.getByText("Sem custo, a margem total ficará indisponível.")).toBeInTheDocument();
  });

  it("a 409 while adding a catalog item triggers a refetch and surfaces the conflict message", async () => {
    vi.mocked(getBudget)
      .mockResolvedValueOnce(budget({ items: [] }))
      .mockResolvedValueOnce(budget({ status: "pending_approval", items: [] }));
    vi.mocked(listCatalogItems).mockResolvedValue({ ...emptyCatalogPage, data: [catalogItem()] });
    vi.mocked(addBudgetItem).mockRejectedValue(new ApiError(409, "Conflict"));
    const user = userEvent.setup();
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: /adicionar item/i }));
    await user.click(screen.getByRole("button", { name: "Catálogo" }));
    await user.type(screen.getByLabelText(/buscar produto ou serviço/i), "cimento");
    await screen.findByText("Cimento CP-II");
    await user.click(screen.getByRole("button", { name: "Selecionar" }));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await screen.findByText("O orçamento foi alterado por outro usuário.");
    await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
  });
});
