/**
 * Pure, derived management summary for one Obra (Project). Nothing
 * here is persisted — every value is recomputed live from data the
 * caller already loaded (Project, its Budget if any, its ProjectCosts,
 * and all Payables). No localStorage access, no React hooks, so this
 * stays trivially testable in isolation.
 *
 * Terminology and formulas are deliberately conservative:
 * - `referenceAmount` is the linked Budget's sale total — never
 *   called "receita"/"faturamento"/"valor contratado", because none of
 *   those concepts exist in this prototype (no confirmed revenue, no
 *   separate contract value). It is `null` unless a Budget is linked
 *   AND still `approved` — a defensive check, since nothing in the
 *   domain currently allows an approved Budget's status to regress
 *   after a Project is created from it, but this keeps the summary
 *   honest if that ever changes.
 * - `realizedCost` is the existing ProjectCost total (`sumCosts`) —
 *   this already includes manual costs, costs materialized from a
 *   paid Payable, and costs materialized from an
 *   EmployeePeriodAllocation. EmployeePeriodAllocation is
 *   deliberately NOT read here — reading it directly would double
 *   count the exact same money that already reached `realizedCost`
 *   through its materialized ProjectCost.
 * - `pendingPayables`/`overduePayables` only ever consider Payables
 *   with `projectId === project.id`. A Payable produced by Contas a
 *   Pagar always has `projectId: undefined` (see
 *   `features/employees/prototype/period-payable.ts`), so workforce
 *   payables never appear here — their economic cost only reaches the
 *   Obra via the Allocation's ProjectCost, independent of whether
 *   that Payable was ever generated or paid.
 * - `committedCost = realizedCost + pendingPayables` is safe from
 *   double counting only because a pending Payable never has a
 *   materialized ProjectCost yet — that materialization happens
 *   exclusively at the moment a Payable is marked paid (see
 *   `features/payables/prototype/payable-payment.ts`), at which point
 *   it leaves `pendingPayables` and its amount enters `realizedCost`
 *   instead. The transition is economically neutral for
 *   `committedCost`.
 * - No `revenue`, `profit`, `cashFlow`, `progress`,
 *   `receivedAmount`, or `physicalProgress` field exists — none of
 *   those are computable safely from the data this prototype has.
 * - `receivableTotal`/`receivableReceived`/`receivableOutstanding`/
 *   `receivableOverdue`/`receivableUpcoming` are a separate dimension
 *   (money owed BY the Customer) from every cost/payable figure above
 *   (money owed BY the company). They are computed exclusively from
 *   `Receivable`/`Receipt` — via the same `calculateReceivableTotals`
 *   helper the global Contas a Receber list and the old ProjectDetail
 *   card already used — and never feed into `realizedCost`,
 *   `committedCost`, or any other cost-side figure. Receiving money
 *   from a Customer is not a cost event and must never change them.
 *   This is not a cash-flow figure (`receivableReceived -
 *   pendingPayables` or similar) — no such combined metric exists in
 *   this prototype yet; see Task 038 discovery notes.
 */

import { formatCurrency } from "@/lib/currency";
import type { Budget } from "@/features/budgets/types";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import { sumCosts, sumCostsByCategory } from "@/features/project-costs/prototype/cost-totals";
import type { ProjectCost, ProjectCostCategory } from "@/features/project-costs/types";
import { getPayableStatus } from "@/features/payables/payable-status";
import type { Payable } from "@/features/payables/types";
import { calculateReceivableTotals } from "@/features/receivables/prototype/receivable-totals";
import type { Receipt, Receivable } from "@/features/receivables/types";
import type { Project } from "../types";

export type ProjectAlertSeverity = "info" | "warning" | "critical";

export interface ProjectAlert {
  severity: ProjectAlertSeverity;
  message: string;
}

export interface ProjectManagementSummary {
  referenceAmount: number | null;

  realizedCost: number;

  pendingPayables: number;
  overduePayables: number;
  upcomingPayables: number;

  committedCost: number;

  remainingAgainstBudget: number | null;
  committedRemainingAgainstBudget: number | null;

  costsByCategory: Array<{ category: ProjectCostCategory; amount: number }>;

  laborCost: number;
  laborShareOfRealizedCost: number | null;

  percentRealizedOfBudget: number | null;
  percentCommittedOfBudget: number | null;

  receivableTotal: number;
  receivableReceived: number;
  receivableOutstanding: number;
  receivableOverdue: number;
  receivableUpcoming: number;

  alerts: ProjectAlert[];
}

function buildAlerts({
  referenceAmount,
  realizedCost,
  committedCost,
  overduePayables,
  receivableOverdue,
}: {
  referenceAmount: number | null;
  realizedCost: number;
  committedCost: number;
  overduePayables: number;
  receivableOverdue: number;
}): ProjectAlert[] {
  const alerts: ProjectAlert[] = [];

  const overBudgetRealized = referenceAmount !== null && realizedCost > referenceAmount;
  // Never show both B and C: if realized cost alone already exceeds the
  // budget, the softer "committed" warning adds no new information.
  const overBudgetCommitted =
    referenceAmount !== null && !overBudgetRealized && committedCost > referenceAmount;

  if (overBudgetRealized) {
    alerts.push({
      severity: "critical",
      message: "Os custos realizados ultrapassaram o orçamento.",
    });
  }

  if (overduePayables > 0) {
    alerts.push({
      severity: "warning",
      message: `Há contas a pagar vencidas totalizando ${formatCurrency(overduePayables)}.`,
    });
  }

  if (receivableOverdue > 0) {
    alerts.push({
      severity: "warning",
      message: `Há contas a receber vencidas totalizando ${formatCurrency(receivableOverdue)}.`,
    });
  }

  if (overBudgetCommitted) {
    alerts.push({
      severity: "warning",
      message: "O custo comprometido ultrapassou o orçamento.",
    });
  }

  if (referenceAmount === null) {
    alerts.push({
      severity: "info",
      message: "Esta obra não possui orçamento definido.",
    });
  }

  // Priority order above already places the most critical alert first,
  // so capping at 3 never hides the most important one.
  return alerts.slice(0, 3);
}

export function buildProjectManagementSummary({
  project,
  budget,
  costs,
  payables,
  receivables,
  receipts,
}: {
  project: Project;
  budget: Budget | null;
  costs: ProjectCost[];
  payables: Payable[];
  receivables: Receivable[];
  receipts: Receipt[];
}): ProjectManagementSummary {
  const referenceAmount =
    budget && budget.status === "approved" ? calculateBudgetTotals(budget).total : null;

  const realizedCost = sumCosts(costs);

  let pendingPayables = 0;
  let overduePayables = 0;
  for (const payable of payables) {
    if (payable.projectId !== project.id) continue;
    const status = getPayableStatus(payable);
    if (status === "pending" || status === "overdue") {
      pendingPayables += payable.amount;
      if (status === "overdue") overduePayables += payable.amount;
    }
  }
  const upcomingPayables = pendingPayables - overduePayables;

  const committedCost = realizedCost + pendingPayables;

  const remainingAgainstBudget = referenceAmount !== null ? referenceAmount - realizedCost : null;
  const committedRemainingAgainstBudget =
    referenceAmount !== null ? referenceAmount - committedCost : null;

  const categoryTotals = sumCostsByCategory(costs);
  const costsByCategory = categoryTotals.map(({ category, total }) => ({
    category,
    amount: total,
  }));
  const laborCost = categoryTotals.find((entry) => entry.category === "labor")?.total ?? 0;
  const laborShareOfRealizedCost = realizedCost > 0 ? laborCost / realizedCost : null;

  const percentRealizedOfBudget =
    referenceAmount !== null && referenceAmount > 0 ? realizedCost / referenceAmount : null;
  const percentCommittedOfBudget =
    referenceAmount !== null && referenceAmount > 0 ? committedCost / referenceAmount : null;

  const projectReceivables = receivables.filter((receivable) => receivable.projectId === project.id);
  const receivableTotals = calculateReceivableTotals(projectReceivables, (receivableId) =>
    receipts.filter((receipt) => receipt.receivableId === receivableId)
  );
  const receivableTotal = receivableTotals.totalReceivable;
  const receivableReceived = receivableTotals.totalReceived;
  const receivableOutstanding = receivableTotals.totalOutstanding;
  const receivableOverdue = receivableTotals.overdueOutstanding;
  const receivableUpcoming = receivableTotals.upcomingOutstanding;

  const alerts = buildAlerts({
    referenceAmount,
    realizedCost,
    committedCost,
    overduePayables,
    receivableOverdue,
  });

  return {
    referenceAmount,
    realizedCost,
    pendingPayables,
    overduePayables,
    upcomingPayables,
    committedCost,
    remainingAgainstBudget,
    committedRemainingAgainstBudget,
    costsByCategory,
    laborCost,
    laborShareOfRealizedCost,
    percentRealizedOfBudget,
    percentCommittedOfBudget,
    receivableTotal,
    receivableReceived,
    receivableOutstanding,
    receivableOverdue,
    receivableUpcoming,
    alerts,
  };
}
