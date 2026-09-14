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

import { BudgetList } from "../budget-list";
import type { BudgetListItem, BudgetPaginationResponse } from "../types";

const refresh = vi.fn();
const authState: { activeCompany: { id: string; name: string } | null } = {
  activeCompany: { id: "company-a", name: "Empresa A" },
};

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ ...authState, refresh }),
}));

vi.mock("../budgets-client", () => ({
  listBudgets: vi.fn(),
}));

import { listBudgets } from "../budgets-client";

function item(number: string, overrides: Partial<BudgetListItem> = {}): BudgetListItem {
  return {
    id: `id-${number}`,
    number,
    status: "draft",
    title: "Reforma da fachada",
    reference: null,
    customer: { id: "cust-1", name: "Cliente Teste" },
    sale_subtotal: "1000.00",
    margin_amount: null,
    margin_percentage: null,
    discount_amount: "0.00",
    total: "1000.00",
    submitted_at: null,
    decided_at: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

function page(numbers: string[], currentPage = 1, lastPage = 1): BudgetPaginationResponse {
  return {
    data: numbers.map((number) => item(number)),
    meta: {
      current_page: currentPage,
      from: numbers.length > 0 ? 1 : null,
      last_page: lastPage,
      per_page: 15,
      to: numbers.length > 0 ? numbers.length : null,
      total: numbers.length,
    },
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe("BudgetList", () => {
  beforeEach(() => {
    vi.mocked(listBudgets).mockReset();
    refresh.mockReset();
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("L1: renders Company A's budgets", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001", "ORC-000002"]));
    render(<BudgetList />);

    await screen.findAllByText("ORC-000001");
    expect(screen.queryAllByText("ORC-000002").length).toBeGreaterThan(0);
  });

  it("L2: switching company hides A's budgets before B's response arrives", async () => {
    let resolveB!: (value: BudgetPaginationResponse) => void;
    const bPromise = new Promise<BudgetPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listBudgets).mockResolvedValueOnce(page(["ORC-000001"])).mockReturnValueOnce(bPromise);

    const { rerender } = render(<BudgetList />);
    await screen.findAllByText("ORC-000001");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetList />);

    expect(screen.queryAllByText("ORC-000001").length).toBe(0);

    resolveB(page(["ORC-000002"]));
    await screen.findAllByText("ORC-000002");
  });

  it("L3: discards a stale response after switching companies", async () => {
    let resolveA!: (value: BudgetPaginationResponse) => void;
    const aPromise = new Promise<BudgetPaginationResponse>((resolve) => {
      resolveA = resolve;
    });
    vi.mocked(listBudgets).mockReturnValueOnce(aPromise).mockResolvedValueOnce(page(["ORC-000002"]));

    const { rerender } = render(<BudgetList />);
    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetList />);

    await screen.findAllByText("ORC-000002");
    // The stale Company A response lands late — it must never override
    // the already-loaded, already-rendered Company B data, and must
    // never cause a loading-state flicker for Company B.
    resolveA(page(["ORC-000001"]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryAllByText("ORC-000001").length).toBe(0);
    expect(screen.queryAllByText("ORC-000002").length).toBeGreaterThan(0);
  });

  it("L4: switching company resets the page back to 1", async () => {
    const pageFive = page(["ORC-000001"], 5, 5);
    pageFive.meta.total = 75; // 5 pages of 15 — makes the pagination nav render page buttons.
    vi.mocked(listBudgets).mockResolvedValueOnce(pageFive).mockResolvedValueOnce(page(["ORC-000002"], 1, 1));

    const { rerender } = render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ir para página 5" })).toHaveAttribute("aria-current", "page");
    });

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetList />);

    await screen.findAllByText("ORC-000002");
    const secondCall = vi.mocked(listBudgets).mock.calls[1]![0];
    expect(secondCall.page).toBe(1);
  });

  it("L5: a stale error for the old tenant never flashes once a new tenant is active", async () => {
    let resolveB!: (value: BudgetPaginationResponse) => void;
    const bPromise = new Promise<BudgetPaginationResponse>((resolve) => {
      resolveB = resolve;
    });
    vi.mocked(listBudgets).mockRejectedValueOnce(new Error("network")).mockReturnValueOnce(bPromise);

    const { rerender } = render(<BudgetList />);
    await screen.findByRole("alert");

    authState.activeCompany = { id: "company-b", name: "Empresa B" };
    rerender(<BudgetList />);

    expect(screen.queryByText(/não foi possível carregar os orçamentos/i)).not.toBeInTheDocument();

    resolveB(page(["ORC-000002"]));
    await screen.findAllByText("ORC-000002");
  });

  it("L6: shows a distinct empty state (with CTA) when there are no budgets at all", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page([]));
    const { container } = render(<BudgetList />);

    await screen.findByText("Nenhum orçamento cadastrado");
    expect(container.querySelector('a[href="/orcamentos/novo"]')).toBeInTheDocument();
  });

  it("L7: shows a distinct empty state (no CTA text) when a search produces zero results", async () => {
    vi.mocked(listBudgets).mockResolvedValueOnce(page(["ORC-000001"])).mockResolvedValueOnce(page([]));
    const user = userEvent.setup();
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");

    await user.type(screen.getByLabelText(/buscar por número, título, referência ou cliente/i), "inexistente");
    await screen.findByText("Nenhum orçamento encontrado", {}, { timeout: 2000 });
    expect(screen.queryByText("Nenhum orçamento cadastrado")).not.toBeInTheDocument();
  });

  it("L8: the budget number is shown verbatim, never reformatted", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000042"]));
    render(<BudgetList />);
    await screen.findAllByText("ORC-000042");
  });

  it("L9: status filter buttons send the selected status param and reset to page 1", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    const user = userEvent.setup();
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");

    await user.click(screen.getByRole("button", { name: "Aprovados" }));

    await waitFor(() => {
      const lastCall = vi.mocked(listBudgets).mock.calls.at(-1)![0];
      expect(lastCall.status).toBe("approved");
      expect(lastCall.page).toBe(1);
    });
  });

  it("L10: search debounces and resets to page 1", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    const user = userEvent.setup();
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");

    await user.type(screen.getByLabelText(/buscar por número, título, referência ou cliente/i), "fachada");

    await waitFor(
      () => {
        const lastCall = vi.mocked(listBudgets).mock.calls.at(-1)![0];
        expect(lastCall.search).toBe("fachada");
        expect(lastCall.page).toBe(1);
      },
      { timeout: 2000 }
    );
  });

  it("L11: an error state offers a retry action", async () => {
    vi.mocked(listBudgets).mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();
    render(<BudgetList />);

    await screen.findByRole("alert");
    vi.mocked(listBudgets).mockResolvedValueOnce(page(["ORC-000001"]));
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await screen.findAllByText("ORC-000001");
  });

  it("L12: no delete action is offered anywhere in the list — the API has no DELETE route", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
  });

  it("L13: no Project/Obra affordance is offered anywhere in the list", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    expect(screen.queryByText(/criar obra/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/abrir obra/i)).not.toBeInTheDocument();
  });

  it("L14: renders a 'Novo orçamento' link pointing at the create route", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page([]));
    const { container } = render(<BudgetList />);
    await screen.findByText("Nenhum orçamento cadastrado");
    expect(container.querySelector('a[href="/orcamentos/novo"]')).toBeInTheDocument();
  });

  it("L15: renders money via decimalStringToBrlDisplay, never a raw Number() cast", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"], 1, 1));
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    // "1000.00" -> "R$ 1.000,00" per decimalStringToBrlDisplay/formatCurrency.
    expect(screen.getAllByText("R$ 1.000,00").length).toBeGreaterThan(0);
  });

  it("L16: shows the margin percentage Brazilian-formatted when present", async () => {
    const withMargin = page(["ORC-000001"]);
    withMargin.data[0]!.margin_amount = "225.00";
    withMargin.data[0]!.margin_percentage = "22.5000";
    vi.mocked(listBudgets).mockResolvedValue(withMargin);
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    expect(screen.getAllByText("22,5000%").length).toBeGreaterThan(0);
  });

  it("L17: never invents a 0% margin when the API sent null — shows an em dash instead", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    render(<BudgetList />);
    await screen.findAllByText("ORC-000001");
    expect(screen.queryAllByText(/0%|0,0000%/).length).toBe(0);
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it("L18: status is shown as visible text, never color-only", async () => {
    vi.mocked(listBudgets).mockResolvedValue(page(["ORC-000001"]));
    render(<BudgetList />);
    await screen.findAllByText("Rascunho");
  });
});
