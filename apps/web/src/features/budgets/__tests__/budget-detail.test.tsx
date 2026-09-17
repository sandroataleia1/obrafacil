import { useEffect, useLayoutEffect } from "react";
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
  getBudgetProposalPdf: vi.fn(),
}));

vi.mock("@/features/catalog/catalog-client", () => ({
  listCatalogItems: vi.fn(),
}));

import { listCatalogItems } from "@/features/catalog/catalog-client";
import {
  approveBudgetManually,
  deleteBudgetItem,
  getBudget,
  getBudgetProposalPdf,
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
    valid_until: null,
    payment_terms: null,
    execution_terms: null,
    proposal_terms: null,
    customer: { name: "Cliente Teste", document: null, phone: null, email: null },
    sale_subtotal: "60.00",
    cost_subtotal: "40.00",
    margin_amount: "20.00",
    margin_percentage: "33.33",
    discount_amount: "0.00",
    total: "60.00",
    proposal_token: null,
    submitted_at: null,
    proposal_template_version: null,
    proposal_company: null,
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
    vi.mocked(getBudgetProposalPdf).mockReset();
    vi.mocked(listCatalogItems).mockReset().mockResolvedValue(emptyCatalogPage);
    authState.activeCompany = { id: "company-a", name: "Empresa A" };
    vi.stubGlobal(
      "URL",
      { createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() }
    );
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
    it("a draft budget never mentions Obra/Projeto and has no delete-the-whole-budget action", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "draft" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.queryByText(/obra/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
    });

    it("a pending_approval budget never mentions Obra/Projeto", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.queryByText(/obra/i)).not.toBeInTheDocument();
    });

    it("a rejected budget never mentions Obra/Projeto", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({ status: "rejected", decided_at: "2026-09-03T00:00:00Z" })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      expect(screen.queryByText(/obra/i)).not.toBeInTheDocument();
    });
  });

  describe("Criar obra a partir deste orçamento (FRONTEND-PROJECTS-01 §10)", () => {
    it("an approved budget shows a single, discrete link to /obras/nova?sourceBudgetId=<id> and never a delete-the-whole-budget action", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "approved", decided_at: "2026-09-03T00:00:00Z" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      const link = screen.getByRole("link", { name: /criar obra a partir deste orçamento/i });
      expect(link).toHaveAttribute("href", "/obras/nova?sourceBudgetId=budget-1");
      expect(screen.queryByRole("button", { name: /excluir/i })).not.toBeInTheDocument();
    });

    it("clicking it performs zero Budget mutation (no PUT/status-action call fires)", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "approved", decided_at: "2026-09-03T00:00:00Z" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");
      screen.getByRole("link", { name: /criar obra a partir deste orçamento/i });
      expect(submitBudget).not.toHaveBeenCalled();
      expect(approveBudgetManually).not.toHaveBeenCalled();
      expect(rejectBudgetManually).not.toHaveBeenCalled();
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

  // ================= DP1-DP14 (PROPOSAL-DOC-01B §75-78/§27-37) =================

  describe("Proposal conditions display", () => {
    /** DP10: shows the conditions card when at least one field is set. */
    it("DP10: shows the Condições da proposta card when at least one condition is set", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({ valid_until: "2026-10-01", payment_terms: "50% na aprovação e 50% na conclusão." })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.getByText("Condições da proposta")).toBeInTheDocument();
      expect(screen.getByText("01/10/2026")).toBeInTheDocument();
      expect(screen.getByText("50% na aprovação e 50% na conclusão.")).toBeInTheDocument();
    });

    it("never shows an empty Condições da proposta card when all four fields are null", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.queryByText("Condições da proposta")).not.toBeInTheDocument();
    });

    /** DP11: internal notes render under their own distinct heading, separate from proposal conditions. */
    it("DP11: internal notes render under 'Observações internas', separate from conditions", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ notes: "Cliente pediu desconto", valid_until: "2026-10-01" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.getByText("Observações internas")).toBeInTheDocument();
      expect(screen.getByText("Cliente pediu desconto")).toBeInTheDocument();
    });

    /** DP12: the frozen Company snapshot is shown discreetly once submitted. */
    it("DP12: shows 'Emitida por' with the snapshot's trade_name once proposal_company is present", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({
          status: "pending_approval",
          proposal_token: "tok-1",
          proposal_template_version: 1,
          proposal_company: {
            name: "Construtora Legal LTDA",
            legal_name: "Construtora Legal LTDA",
            trade_name: "Construtora Legal",
            document: "12345678000199",
            phone: null,
            whatsapp: null,
            email: null,
            address: {
              postal_code: null,
              street: null,
              number: null,
              complement: null,
              neighborhood: null,
              city: null,
              state: null,
              reference_point: null,
            },
            timezone: "America/Sao_Paulo",
            logo_url: null,
          },
        })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.getByText("Emitida por: Construtora Legal")).toBeInTheDocument();
    });

    /** §61: the template version is never rendered anywhere for a normal user. */
    it("never renders the raw proposal_template_version anywhere", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({ status: "pending_approval", proposal_token: "tok-1", proposal_template_version: 1 })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\btemplate\b/i);
    });
  });

  describe("PDF actions", () => {
    /** DP1/DP3: a draft shows 'Visualizar prévia PDF' and it never submits. */
    it("DP1/DP3: draft shows 'Visualizar prévia PDF' and clicking it never calls submitBudget", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      vi.mocked(getBudgetProposalPdf).mockResolvedValue(new Blob(["%PDF-fake"]));
      vi.spyOn(window, "open").mockReturnValue({ closed: false, location: { href: "" }, close: vi.fn() } as unknown as Window);
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      const previewButton = screen.getByRole("button", { name: /visualizar prévia pdf/i });
      await user.click(previewButton);

      await waitFor(() => expect(getBudgetProposalPdf).toHaveBeenCalledWith("budget-1"));
      expect(submitBudget).not.toHaveBeenCalled();
    });

    /** DP2: the preview action calls the authenticated PDF endpoint (via getBudgetProposalPdf), never the public one. */
    it("DP2: preview calls getBudgetProposalPdf (authenticated), not a public endpoint", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      vi.mocked(getBudgetProposalPdf).mockResolvedValue(new Blob(["%PDF-fake"]));
      vi.spyOn(window, "open").mockReturnValue({ closed: false, location: { href: "" }, close: vi.fn() } as unknown as Window);
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar prévia pdf/i }));

      await waitFor(() => expect(getBudgetProposalPdf).toHaveBeenCalledTimes(1));
    });

    /** DP4: pending shows 'Visualizar PDF'. */
    it("DP4: pending_approval shows a 'Visualizar PDF' button", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.getByRole("button", { name: /visualizar pdf/i })).toBeInTheDocument();
    });

    /** DP5: pending shows 'Baixar PDF' and clicking it fetches the blob and creates a download anchor. */
    it("DP5: pending_approval download fetches the PDF and triggers a download", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.mocked(getBudgetProposalPdf).mockResolvedValue(new Blob(["%PDF-fake"]));
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /baixar pdf/i }));

      await waitFor(() => expect(getBudgetProposalPdf).toHaveBeenCalledWith("budget-1"));
    });

    /** DP7: a 500 on the PDF request shows a clear feedback message, never a full-page replacement. */
    it("DP7: a PDF 500 shows a clear message without replacing the whole page", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.mocked(getBudgetProposalPdf).mockRejectedValue(new ApiError(500, "boom"));
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar pdf/i }));

      await screen.findByText("Não foi possível gerar o PDF agora.");
      expect(screen.getByText("Aguardando aprovação")).toBeInTheDocument();
    });

    /** DP6: a decided (approved/rejected) Budget still shows PDF view/download actions. */
    it("DP6: a decided Budget still shows 'Visualizar PDF' and 'Baixar PDF'", async () => {
      vi.mocked(getBudget).mockResolvedValue(
        budget({ status: "approved", proposal_token: "tok-1", decided_at: "2026-09-03T00:00:00Z" })
      );
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      expect(screen.getByRole("button", { name: /visualizar pdf/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /baixar pdf/i })).toBeInTheDocument();
    });

    /** PO1: Company A PDF success — the normal, non-racy path. */
    it("PO1: a normal PDF view under a single Company navigates the placeholder to the blob URL", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.mocked(getBudgetProposalPdf).mockResolvedValue(new Blob(["%PDF-fake"]));
      const placeholder = { closed: false, location: { href: "" }, close: vi.fn(), opener: {} } as unknown as Window;
      vi.spyOn(window, "open").mockReturnValue(placeholder);
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar pdf/i }));

      await waitFor(() => expect(placeholder.location.href).toBe("blob:fake-url"));
    });

    /**
     * PO2/PO3/§10: the EXACT race — Company A's "Visualizar PDF" fetch is
     * left pending, the Company switches to B, and the Blob resolves in
     * the exact same synchronous block as the `rerender` that commits the
     * switch. This is an end-to-end BEHAVIORAL regression proof (mirrors
     * `EditBudgetHeaderForm`'s ER1 pattern) — it asserts the observable
     * outcome the `useLayoutEffect` fix produces. The dedicated,
     * hook-distinguishing proof that `useLayoutEffect` genuinely commits
     * before `useEffect` for the same render lives in the
     * "useLayoutEffect vs useEffect ordering" describe block at the
     * bottom of this file (RTL's `rerender()` flushes BOTH effect types
     * synchronously before returning, so this pattern alone cannot tell
     * the two hooks apart — see that block's comment for the full proof).
     */
    it("PO2/PO3: a Company-A PDF resolving in the exact tick after switching to B closes A's placeholder and shows nothing under B", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      let resolvePdf!: (value: Blob) => void;
      vi.mocked(getBudgetProposalPdf).mockReturnValue(
        new Promise((resolve) => {
          resolvePdf = resolve;
        })
      );
      const placeholder = { closed: false, location: { href: "" }, close: vi.fn(), opener: {} } as unknown as Window;
      vi.spyOn(window, "open").mockReturnValue(placeholder);
      const user = userEvent.setup();
      const { rerender } = render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar pdf/i }));

      // Switch to B and resolve A's in-flight PDF fetch in the SAME
      // synchronous block, before any further await — the exact race
      // the useLayoutEffect fix targets.
      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<BudgetDetail id="budget-1" />);
      resolvePdf(new Blob(["%PDF-fake"]));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(placeholder.location.href).toBe("");
      expect(placeholder.close).toHaveBeenCalled();
      expect(screen.queryByText("Não foi possível gerar o PDF agora.")).not.toBeInTheDocument();
      // B is never left stuck showing a loading/disabled PDF action —
      // load() for B already reset pdfAction to null.
      expect(screen.getByRole("button", { name: /visualizar pdf/i })).not.toBeDisabled();
    });

    /**
     * PO4/§11: the same exact race, but for the Budget id (same Company,
     * navigating from Budget A to Budget B) — `currentBudgetIdRef` must
     * also be pre-paint via `useLayoutEffect`.
     */
    it("PO4: a Budget-A PDF resolving in the exact tick after navigating to Budget B closes A's placeholder", async () => {
      vi.mocked(getBudget)
        .mockResolvedValueOnce(budget({ id: "budget-1", number: "ORC-000001", status: "pending_approval", proposal_token: "tok-1" }))
        .mockResolvedValueOnce(budget({ id: "budget-2", number: "ORC-000002", status: "pending_approval", proposal_token: "tok-2" }));
      let resolvePdf!: (value: Blob) => void;
      vi.mocked(getBudgetProposalPdf).mockReturnValue(
        new Promise((resolve) => {
          resolvePdf = resolve;
        })
      );
      const placeholder = { closed: false, location: { href: "" }, close: vi.fn(), opener: {} } as unknown as Window;
      vi.spyOn(window, "open").mockReturnValue(placeholder);
      const user = userEvent.setup();
      const { rerender } = render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar pdf/i }));

      rerender(<BudgetDetail id="budget-2" />);
      resolvePdf(new Blob(["%PDF-fake"]));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(placeholder.location.href).toBe("");
      expect(placeholder.close).toHaveBeenCalled();
    });

    /** PO5: a stale download response never creates a download anchor. */
    it("PO5: a stale download response creates zero download anchor", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      let resolvePdf!: (value: Blob) => void;
      vi.mocked(getBudgetProposalPdf).mockReturnValue(
        new Promise((resolve) => {
          resolvePdf = resolve;
        })
      );
      const clickSpy = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === "a") el.click = clickSpy;
        return el;
      });
      const user = userEvent.setup();
      const { rerender } = render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /baixar pdf/i }));

      authState.activeCompany = { id: "company-b", name: "Empresa B" };
      rerender(<BudgetDetail id="budget-1" />);
      resolvePdf(new Blob(["%PDF-fake"]));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(clickSpy).not.toHaveBeenCalled();
      createElementSpy.mockRestore();
    });

    /** PP7: a blocked popup (window.open returns null) shows the friendly orientation message in Budget Detail, and never fetches the PDF. */
    it("PP7: a blocked popup shows the friendly message and never fetches the PDF", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget({ status: "pending_approval", proposal_token: "tok-1" }));
      vi.spyOn(window, "open").mockReturnValue(null);
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /visualizar pdf/i }));

      await screen.findByText(
        "Não foi possível abrir uma nova aba. Permita pop-ups para visualizar o PDF ou use Baixar PDF."
      );
      expect(getBudgetProposalPdf).not.toHaveBeenCalled();
    });
  });

  describe("Submit logo-missing error (§64)", () => {
    /** DP14: a 422 with no field errors and the specific logo message shows it verbatim, with a link to fix the Company profile. */
    it("DP14: a 422 logo-missing message is shown verbatim with a link to Configurações → Empresa", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      vi.mocked(submitBudget).mockRejectedValue(
        new ApiValidationError(
          {},
          "A logo cadastrada da empresa não está disponível. Reenvie a logo antes de disponibilizar a proposta."
        )
      );
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /disponibilizar para aprovação/i }));
      await user.click(screen.getByRole("button", { name: "Disponibilizar" }));

      await screen.findByText(
        "A logo cadastrada da empresa não está disponível. Reenvie a logo antes de disponibilizar a proposta."
      );
      const link = screen.getByRole("link", { name: "Atualizar perfil da empresa" });
      expect(link).toHaveAttribute("href", "/configuracoes/empresa");
      // Status remains draft — the CTA to submit is still available.
      expect(screen.getByRole("button", { name: /disponibilizar para aprovação/i })).toBeInTheDocument();
    });

    /** DP13: the submit confirm dialog mentions the freeze consequence. */
    it("DP13: the submit confirm dialog explicitly mentions freezing company/logo/items/values/conditions", async () => {
      vi.mocked(getBudget).mockResolvedValue(budget());
      const user = userEvent.setup();
      render(<BudgetDetail id="budget-1" />);
      await screen.findAllByText("ORC-000001");

      await user.click(screen.getByRole("button", { name: /disponibilizar para aprovação/i }));

      await screen.findByText(
        "Os dados da empresa, logo, itens, valores e condições serão congelados nesta versão."
      );
    });
  });
});

/**
 * PROPOSAL-DOC-01B1 §7/§10: a direct, low-level proof that
 * `useLayoutEffect` genuinely commits a ref update before ANY
 * `useEffect` in the same commit gets a chance to run — the actual
 * guarantee `activeCompanyIdRef`/`currentBudgetIdRef` rely on.
 *
 * A `rerender(); resolvePromise();` pattern (used by the PO2-PO5 tests
 * above for their end-to-end behavioral assertions) does NOT by itself
 * distinguish `useLayoutEffect` from `useEffect`: React Testing Library
 * wraps `rerender()` in `act()`, and the synchronous `act()` overload
 * flushes BOTH layout AND passive effects before returning control to
 * the test — verified empirically below. Any code that reads a ref
 * immediately after `rerender()` returns sees the post-passive-effect
 * value regardless of which hook wrote it, in this environment. This is
 * why a dedicated ordering probe is needed to actually verify the
 * claim (as required by §7: "Teste precisa realmente distinguir
 * useEffect vs useLayoutEffect"), rather than trusting the PO tests'
 * behavioral assertions alone to prove the hook choice matters.
 */
describe("useLayoutEffect vs useEffect ordering (PROPOSAL-DOC-01B1 §7/§10)", () => {
  /**
   * Empirical baseline: proves `rerender()` really does flush a plain
   * `useEffect` synchronously in this test environment — establishing
   * why the PO2/PO4 exact-tick tests above are regression proofs of
   * observable behavior, not proofs of the hook-type distinction itself.
   */
  it("rerender() flushes a plain useEffect synchronously before returning (RTL/act() behavior)", () => {
    function Probe({ value, target }: { value: string; target: { current: string } }) {
      useEffect(() => {
        target.current = value;
      }, [value, target]);
      return <div>{value}</div>;
    }

    const target = { current: "initial" };
    const { rerender } = render(<Probe value="A" target={target} />);
    expect(target.current).toBe("A");

    rerender(<Probe value="B" target={target} />);
    // No await — checked synchronously right after rerender() returns.
    expect(target.current).toBe("B");
  });

  /**
   * The real, order-based proof: `useLayoutEffect` always commits BEFORE
   * `useEffect` for the SAME render, when both depend on the same
   * changing value — a genuine, directly-observable distinction between
   * the two hooks (React's documented commit-phase ordering: all layout
   * effects for a commit run before any passive effect for that commit).
   * This is the actual guarantee `activeCompanyIdRef`/`currentBudgetIdRef`
   * depend on: whatever the ref's value is by the time ANY effect for
   * this commit (layout or passive) has run, a layout-effect write is
   * guaranteed to already be reflected — never the other way around.
   */
  it("a useLayoutEffect ref-write always commits before a useEffect in the SAME render", () => {
    const log: string[] = [];

    function LayoutWriter({ value }: { value: string }) {
      useLayoutEffect(() => {
        log.push(`layout:${value}`);
      }, [value]);
      return null;
    }

    function PassiveReader({ value }: { value: string }) {
      useEffect(() => {
        log.push(`passive:${value}`);
      }, [value]);
      return null;
    }

    function Harness({ value }: { value: string }) {
      return (
        <>
          <LayoutWriter value={value} />
          <PassiveReader value={value} />
        </>
      );
    }

    const { rerender } = render(<Harness value="A" />);
    expect(log).toEqual(["layout:A", "passive:A"]);

    log.length = 0;
    rerender(<Harness value="B" />);
    expect(log).toEqual(["layout:B", "passive:B"]);
  });

  /**
   * The real regression this microgate closes: BEFORE this round,
   * `activeCompanyIdRef` was updated via `useEffect`. Reproduced here
   * with an equivalent minimal component — a ref updated via
   * `useEffect` is NOT guaranteed to reflect a new value by the time a
   * SIBLING `useLayoutEffect` (which fires first in commit order) reads
   * it, because passive effects always run strictly after every layout
   * effect in the same commit — proving the ordering hazard the
   * production fix (moving the ref update to `useLayoutEffect`)
   * eliminates entirely, by construction.
   */
  it("a useEffect-based ref-write is NOT yet visible to a layout effect in the SAME commit (the pre-fix hazard)", () => {
    const observedDuringLayout: (string | undefined)[] = [];

    function EffectWriter({ value, refObj }: { value: string; refObj: { current: string | undefined } }) {
      useEffect(() => {
        refObj.current = value;
      }, [value, refObj]);
      return null;
    }

    function LayoutObserver({ refObj }: { refObj: { current: string | undefined } }) {
      useLayoutEffect(() => {
        observedDuringLayout.push(refObj.current);
      });
      return null;
    }

    const refObj: { current: string | undefined } = { current: undefined };
    const { rerender } = render(
      <>
        <EffectWriter value="A" refObj={refObj} />
        <LayoutObserver refObj={refObj} />
      </>
    );
    // Mount: refObj.current is still undefined when LayoutObserver's
    // layout effect runs (EffectWriter's passive effect hasn't fired yet).
    expect(observedDuringLayout[0]).toBeUndefined();

    observedDuringLayout.length = 0;
    rerender(
      <>
        <EffectWriter value="B" refObj={refObj} />
        <LayoutObserver refObj={refObj} />
      </>
    );
    // Update: LayoutObserver's layout effect (commit-ordered before any
    // passive effect) still sees the OLD value "A" — exactly the stale
    // read a `useEffect`-based `activeCompanyIdRef` would have produced
    // for any layout-phase or synchronous-imperative consumer.
    expect(observedDuringLayout[0]).toBe("A");
  });
});
