/**
 * Per-project analytics facts (Demo-Ready 010A). Reuses
 * `calculateBudgetTotals` and `sumCosts` — never re-derives those
 * formulas. This is deliberately NOT a copy of
 * `features/projects/prototype/project-summary.ts`'s
 * `buildProjectManagementSummary`: that function already exists, is
 * still the source of truth for the Obra detail screen, and is left
 * untouched. `ProjectBudgetFacts` here adds a different, additional
 * comparison (realized cost against the COST budget, `budgetedCost`
 * with no margin) rather than duplicating the sale-price-based
 * `referenceAmount`/`remainingAgainstBudget` that summary already
 * exposes — see the doc comment on `ProjectBudgetFacts` in `types.ts`.
 *
 * Every builder takes already-loaded domain data as input — no store
 * reads, no writes, fully pure.
 */

import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import type { Budget } from "@/features/budgets/types";
import { sumCosts } from "@/features/project-costs/prototype/cost-totals";
import type { ProjectCost } from "@/features/project-costs/types";
import type { Payable } from "@/features/payables/types";
import type { Receipt, Receivable } from "@/features/receivables/types";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem } from "@/features/purchases/types";
import type { MaterialConsumption, MaterialRequirement } from "@/features/materials/types";
import { aggregatePayables, aggregateReceivables } from "./financial-analytics";
import { buildProjectMaterialsFacts } from "./materials-analytics";
import type { ProjectAnalyticsFacts, ProjectBudgetFacts } from "./types";

/**
 * `null` for every budget-derived field when there is no `Budget`
 * linked, or it isn't `"approved"` — the same gate
 * `buildProjectManagementSummary` already uses for `referenceAmount`.
 * `remainingBudget` is never clamped: negative means realized cost
 * overran the cost budget (Demo-Ready 010A §17).
 */
export function buildProjectBudgetFacts(budget: Budget | null, costs: ProjectCost[]): ProjectBudgetFacts {
  const realizedCost = sumCosts(costs);

  if (!budget || budget.status !== "approved") {
    return {
      budgetedCost: null,
      budgetSaleTotal: null,
      budgetMarginAmount: null,
      realizedCost,
      remainingBudget: null,
      financialConsumptionPercent: null,
      isOverBudget: null,
    };
  }

  const totals = calculateBudgetTotals(budget);
  const remainingBudget = totals.costTotal - realizedCost;
  const financialConsumptionPercent = totals.costTotal > 0 ? realizedCost / totals.costTotal : null;

  return {
    budgetedCost: totals.costTotal,
    budgetSaleTotal: totals.total,
    budgetMarginAmount: totals.marginAmount,
    realizedCost,
    remainingBudget,
    financialConsumptionPercent,
    isOverBudget: remainingBudget < 0,
  };
}

export function buildProjectAnalyticsFacts(input: {
  projectId: string;
  budget: Budget | null;
  costs: ProjectCost[];
  payables: Payable[];
  receivables: Receivable[];
  receiptsFor: (receivableId: string) => Receipt[];
  materialRequirements: MaterialRequirement[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  goodsReceiptItems: GoodsReceiptItem[];
  materialConsumptions: MaterialConsumption[];
}): ProjectAnalyticsFacts {
  const projectPayables = input.payables.filter((payable) => payable.projectId === input.projectId);
  const projectReceivables = input.receivables.filter((receivable) => receivable.projectId === input.projectId);

  return {
    projectId: input.projectId,
    budget: buildProjectBudgetFacts(input.budget, input.costs),
    payables: aggregatePayables(projectPayables),
    receivables: aggregateReceivables(projectReceivables, input.receiptsFor),
    materials: buildProjectMaterialsFacts(
      input.materialRequirements,
      input.purchaseOrders,
      input.purchaseOrderItems,
      input.goodsReceiptItems,
      input.materialConsumptions
    ),
  };
}
