import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "@/lib/api-client";
import { BudgetDetail } from "../budget-detail";
import type { Budget, BudgetItem } from "../types";

// The item dialogs render via `ResponsiveDialog`, which reads
// `window.matchMedia` to pick Dialog vs Sheet — jsdom has no real
// implementation.
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
import {
  approveBudgetManually,
  deleteBudgetItem,
  getBudget,
  rejectBudgetManually,
  submitBudget,
  updateBudgetItem,
} from "../budgets-client";

const emptyCatalogPage = {
  data: [],
  meta: { current_page: 1, from: null, last_page: 1, per_page: 15, to: null, total: 0 },
  links: { first: null, last: null, prev: null, next: null },
};

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
    quantity: "2.000",
    unit_price: "30.00",
    unit_cost: "20.00",
    line_discount: "0.00",
    line_total: "60.00",
    line_cost_total: "40.00",
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
    customer: { name: "Cliente Teste", document: null, phone: null, email: null },
    sale_subtotal: "60.00",
    cost_subtotal: "40.00",
    margin_amount: "20.00",
    margin_percentage: "33.33",
    discount_amount: "0.00",
    total: "60.00",
    proposal_token: null,
    submitted_at: null,
    decision_source: null,
    decision_by_user_id: null,
    decision_by_name: null,
    decision_note: null,
    decided_at: null,
    items: [budgetItem()],
    created_by_user_id: "user-1",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("BudgetDetail", () => {
  beforeEach(() => {
    vi.mocked(getBudget).mockReset();
    vi.mocked(submitBudget).mockReset();
    vi.mocked(approveBudgetManually).mockReset();
    vi.mocked(rejectBudgetManually).mockReset();
    vi.mocked(updateBudgetItem).mockReset();
    vi.mocked(deleteBudgetItem).mockReset();
    vi.mocked(listCatalogItems).mockReset().mockResolvedValue(emptyCatalogPage);
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the number, title and status for a draft budget with editable actions", async () => {
    vi.mocked(getBudget).mockResolvedValue(budget());
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");
    expect(screen.getAllByText("Reforma cozinha").length).toBeGreaterThan(0);
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /editar/i })).toHaveAttribute("href", "/orcamentos/budget-1/editar");
    expect(screen.getByRole("button", { name: /adicionar item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar cimento cp-ii/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remover cimento cp-ii/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disponibilizar para aprovação/i })).toBeInTheDocument();
  });

  it("renders pending_approval fully readonly: no header edit, no item add/edit/delete", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({ status: "pending_approval", submitted_at: "2026-09-02T00:00:00Z", proposal_token: "tok-1" })
    );
    const { container } = render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");
    expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adicionar item/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar cimento cp-ii/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remover cimento cp-ii/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar aprovação/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar recusa/i })).toBeInTheDocument();
    // "Visualizar proposta" renders via `Button`'s `render={<Link>}` prop,
    // which the a11y tree exposes as role "button" (mirrors
    // `BudgetList`'s equivalent assertion, which queries the underlying
    // anchor directly rather than by accessible role).
    expect(container.querySelector('a[href="/proposta/tok-1"]')).toBeInTheDocument();
  });

  it("draft never shows a proposal link even if a token were somehow present", async () => {
    vi.mocked(getBudget).mockResolvedValue(budget({ status: "draft", proposal_token: null }));
    const { container } = render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");
    expect(container.querySelector('a[href^="/proposta/"]')).not.toBeInTheDocument();
  });

  it("renders approved with decision info (public_link) and no mutable actions", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({
        status: "approved",
        decided_at: "2026-09-03T00:00:00Z",
        decision_source: "public_link",
        decision_by_name: "João Cliente",
        decision_by_user_id: "user-decision-uuid-1",
        proposal_token: "tok-1",
      })
    );
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");
    expect(screen.getByText("Aprovado pelo cliente via proposta")).toBeInTheDocument();
    expect(screen.getByText("João Cliente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar aprovação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disponibilizar para aprovação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adicionar item/i })).not.toBeInTheDocument();
    // Never renders the raw decision_by_user_id UUID anywhere on the page.
    expect(document.body.textContent).not.toContain("user-decision-uuid-1");
  });

  it("renders rejected with decision info (manual_internal) and no mutable actions", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({
        status: "rejected",
        decided_at: "2026-09-03T00:00:00Z",
        decision_source: "manual_internal",
        decision_note: "Cliente desistiu",
      })
    );
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");
    expect(screen.getByText("Decisão registrada internamente")).toBeInTheDocument();
    expect(screen.getByText("Cliente desistiu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar recusa/i })).not.toBeInTheDocument();
  });

  /** DN1 (FRONTEND-BUDGETS-01A §19): a public_link decision WITH a note shows the note in the authenticated Detail. */
  it("DN1: public_link decision with a decision_note shows the note on the authenticated Detail", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({
        status: "approved",
        decided_at: "2026-09-03T00:00:00Z",
        decision_source: "public_link",
        decision_by_name: "Cliente Final Público",
        decision_note: "Aprovado conforme visita técnica.",
        proposal_token: "tok-1",
      })
    );
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    expect(screen.getByText("Aprovado pelo cliente via proposta")).toBeInTheDocument();
    expect(screen.getByText("Cliente Final Público")).toBeInTheDocument();
    expect(screen.getByText("Aprovado conforme visita técnica.")).toBeInTheDocument();
  });

  /** DN2: a public_link decision with NO note never renders an empty "Observação" block. */
  it("DN2: public_link decision without a decision_note shows no empty Observação block", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({
        status: "approved",
        decided_at: "2026-09-03T00:00:00Z",
        decision_source: "public_link",
        decision_by_name: "João Cliente",
        decision_note: null,
        proposal_token: "tok-1",
      })
    );
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    expect(screen.getByText("Aprovado pelo cliente via proposta")).toBeInTheDocument();
    expect(screen.queryByText("Observação")).not.toBeInTheDocument();
  });

  /** DN3: manual_internal decisions continue to show decision_note (regression). */
  it("DN3: manual_internal decision continues to show decision_note", async () => {
    vi.mocked(getBudget).mockResolvedValue(
      budget({
        status: "rejected",
        decided_at: "2026-09-03T00:00:00Z",
        decision_source: "manual_internal",
        decision_note: "Cliente desistiu",
      })
    );
    render(<BudgetDetail id="budget-1" />);
    await screen.findAllByText("ORC-000001");

    expect(screen.getByText("Decisão registrada internamente")).toBeInTheDocument();
    expect(screen.getByText("Cliente desistiu")).toBeInTheDocument();
  });

  describe("Money null-safety", () => {
    it("never renders R$ 0,00 for null cost/margin — shows em-dash instead", async () => {
      // discount_amount is deliberately non-zero here so the only way
      // "R$ 0,00" could appear is a bug coercing a null cost/margin —
      // a genuinely zero discount rendering as "R$ 0,00" is correct and
      // must not be confused with that invariant.
      vi.mocked(getBudget).mockResolvedValue(
        budget({ cost_subtotal: null, margin_amount: null, margin_percentage: null, discount_amount: "10.00" })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.getByText("Custo não informado para todos os itens")).toBeInTheDocument();
      expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
      // Both Custo and Margem/Margem% rows render "—".
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it("renders a negative margin_amount correctly as negative BRL, never as R$ 0,00", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({
          margin_amount: "-20.00",
          margin_percentage: "-33.33",
          cost_subtotal: "80.00",
          discount_amount: "10.00",
        })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.getByText("-R$ 20,00")).toBeInTheDocument();
      expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    });

    it("always shows sale_subtotal as a real value, never coerced", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ sale_subtotal: "0.00" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.getByText("Subtotal de venda")).toBeInTheDocument();
    });
  });

  describe("Submit for approval", () => {
    it("opens a mandatory confirm dialog with the exact required text before submitting", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      vi.mocked(submitBudget).mockResolvedValue(
        budget({ status: "pending_approval", submitted_at: "2026-09-02T00:00:00Z", proposal_token: "tok-1" })
      );
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /disponibilizar para aprovação/i }));
      await screen.findByText("Disponibilizar para aprovação?");
      expect(
        screen.getByText("Depois de disponibilizado, este orçamento não poderá mais ser editado.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Para alterar a proposta depois, será necessário criar um novo orçamento.")
      ).toBeInTheDocument();
      expect(submitBudget).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Disponibilizar" }));
      await waitFor(() => expect(submitBudget).toHaveBeenCalledWith("budget-1"));
      await waitFor(() => expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /adicionar item/i })).not.toBeInTheDocument();
    });
  });

  describe("Manual decisions", () => {
    it("approve-manually sends { note } without asking for a name", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.mocked(approveBudgetManually).mockResolvedValue(
        budget({
          status: "approved",
          decided_at: "2026-09-03T00:00:00Z",
          decision_source: "manual_internal",
          decision_note: "Ok",
        })
      );
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /registrar aprovação/i }));
      await screen.findByText("Registrar aprovação?");
      expect(screen.queryByLabelText(/nome/i)).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("Observação"), "Ok");
      await user.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

      await waitFor(() => expect(approveBudgetManually).toHaveBeenCalledWith("budget-1", { note: "Ok" }));
      await waitFor(() => expect(screen.getByText("Aprovado")).toBeInTheDocument());
    });

    it("reject-manually sends { note: null } when left empty", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.mocked(rejectBudgetManually).mockResolvedValue(
        budget({ status: "rejected", decided_at: "2026-09-03T00:00:00Z", decision_source: "manual_internal" })
      );
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /registrar recusa/i }));
      await screen.findByText("Registrar recusa?");
      await user.click(screen.getByRole("button", { name: "Confirmar recusa" }));

      await waitFor(() => expect(rejectBudgetManually).toHaveBeenCalledWith("budget-1", { note: null }));
    });

    it("a 409 (race with the public link) refetches and shows the race message, without retrying automatically", async () => {
      vi.mocked(getBudget)
        .mockResolvedValueOnce(budget({ status: "pending_approval", proposal_token: "tok-1" }))
        .mockResolvedValueOnce(
          budget({
            status: "approved",
            decided_at: "2026-09-03T00:00:00Z",
            decision_source: "public_link",
            decision_by_name: "João Cliente",
          })
        );
      vi.mocked(approveBudgetManually).mockRejectedValue(new ApiError(409, "Conflict"));
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /registrar aprovação/i }));
      await user.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

      await screen.findByText("Este orçamento já recebeu uma decisão.");
      await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("Aprovado pelo cliente via proposta")).toBeInTheDocument());
      expect(approveBudgetManually).toHaveBeenCalledTimes(1);
    });
  });

  describe("Item edit", () => {
    it("sends only the 4 allowed fields (quantity, unit_price, line_discount, notes)", async () => {
      vi.mocked(getBudget)
        .mockResolvedValueOnce(budget({ items: [budgetItem()] }))
        .mockResolvedValueOnce(budget({ items: [budgetItem({ quantity: "3.000", line_total: "90.00" })] }));
      vi.mocked(updateBudgetItem).mockResolvedValue(budgetItem({ quantity: "3.000", line_total: "90.00" }));
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /editar cimento cp-ii/i }));
      const qtyInput = await screen.findByLabelText("Quantidade");
      await user.clear(qtyInput);
      await user.type(qtyInput, "3");
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(updateBudgetItem).toHaveBeenCalledWith("budget-1", "item-1", {
          quantity: "3.000",
          unit_price: "30.00",
          line_discount: "0.00",
          notes: null,
        })
      );
      const call = vi.mocked(updateBudgetItem).mock.calls[0]![2] as unknown as Record<string, unknown>;
      expect(call).not.toHaveProperty("source_type");
      expect(call).not.toHaveProperty("catalog_item_id");
      expect(call).not.toHaveProperty("unit_cost");
      expect(call).not.toHaveProperty("name");
      await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
    });
  });

  describe("Item delete", () => {
    it("shows the exact confirmation text and refetches on success", async () => {
      vi.mocked(getBudget)
        .mockResolvedValueOnce(budget({ items: [budgetItem()] }))
        .mockResolvedValueOnce(budget({ items: [] }));
      vi.mocked(deleteBudgetItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await screen.findByText("Remover este item do orçamento?");
      await user.click(screen.getByRole("button", { name: "Remover" }));

      await waitFor(() => expect(deleteBudgetItem).toHaveBeenCalledWith("budget-1", "item-1"));
      await waitFor(() => expect(getBudget).toHaveBeenCalledTimes(2));
    });

    it("a 422 (discount exceeds new subtotal) leaves the item in place and shows the required message", async () => {
      vi.mocked(getBudget).mockResolvedValueOnce(budget({ items: [budgetItem()] }));
      vi.mocked(deleteBudgetItem).mockRejectedValue(
        new ApiValidationError({ discount_amount: ["O desconto não pode ser maior que o novo subtotal."] })
      );
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));

      await screen.findByText("Reduza o desconto do orçamento antes de remover este item.");
      expect(getBudget).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Cimento CP-II")).toBeInTheDocument();
    });
  });

  describe("Zero project/localStorage affordances", () => {
    it("never mentions Obra/Projeto and has no delete-the-whole-budget action", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "approved", decided_at: "2026-09-03T00:00:00Z" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.queryByText(/obra/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^criar obra$/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
    });
  });

  describe("Errors", () => {
    it("a 404 shows a not-found message", async () => {
      vi.mocked(getBudget).mockRejectedValue(new ApiError(404, "Not found"));
      render(<BudgetDetail id="missing" />);
      await screen.findByText("Orçamento não encontrado");
    });

    it("a network error shows a retry affordance, never an infinite skeleton", async () => {
      vi.mocked(getBudget).mockRejectedValueOnce(new Error("network"));
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);

      await screen.findByRole("button", { name: /tentar novamente/i });
      vi.mocked(getBudget).mockResolvedValueOnce(budget());
      await user.click(screen.getByRole("button", { name: /tentar novamente/i }));

      await screen.findAllByText("ORC-000001");
    });
  });

  describe("Tenant safety", () => {
    it("switching company hides Company A's budget before Company B's response arrives", async () => {
      let resolveB!: (value: Budget) => void;
      const bPromise = new Promise<Budget>((resolve) => {
        resolveB = resolve;
      });
      vi.mocked(getBudget).mockResolvedValueOnce(budget({ number: "ORC-000001" })).mockReturnValueOnce(bPromise);

      const { rerender } = render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<BudgetDetail id="budget-1" />);

      expect(screen.queryByText("ORC-000001")).not.toBeInTheDocument();
      resolveB(budget({ number: "ORC-000002" }));
      await screen.findAllByText("ORC-000002");
    });

    it("a late post-delete refresh for Company A never repaints under Company B", async () => {
      let resolveRefetch!: (value: Budget) => void;
      const refetchPromise = new Promise<Budget>((resolve) => {
        resolveRefetch = resolve;
      });
      vi.mocked(getBudget)
        .mockResolvedValueOnce(budget({ items: [budgetItem()] }))
        .mockReturnValueOnce(refetchPromise)
        .mockResolvedValueOnce(budget({ number: "ORC-000002", items: [] }));
      vi.mocked(deleteBudgetItem).mockResolvedValue(undefined);
      const user = userEvent.setup();
      const { rerender } = render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /remover cimento cp-ii/i }));
      await user.click(screen.getByRole("button", { name: "Remover" }));
      await waitFor(() => expect(deleteBudgetItem).toHaveBeenCalled());

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000002");

      resolveRefetch(budget({ items: [budgetItem()] }));
      await waitFor(() => expect(screen.queryByText("Cimento CP-II")).not.toBeInTheDocument());
    });
  });
});
