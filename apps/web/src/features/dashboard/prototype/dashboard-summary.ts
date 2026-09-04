/**
 * Pure, derived summary for the Dashboard (Início). Nothing here is
 * persisted — every value is recomputed from data the caller already
 * loaded (all Projects/Budgets/ProjectCosts/Payables/Receivables/
 * Receipts). No localStorage access, no React, so this stays trivially
 * testable in isolation — mirrors
 * `features/projects/prototype/project-summary.ts`, which this module
 * composes rather than reimplements.
 *
 * Every metric is derived exclusively from its own source — there is
 * no `if (!projects.length) return emptyDashboard` gate anywhere below.
 * A Payable or an approved-but-unlinked Budget exists independently of
 * whether any Project exists at all (see Demo-Ready 007B, Estado B).
 */

import { todayIso } from "@/lib/date";
import { calculateBudgetTotals } from "@/features/budgets/prototype/budget-totals";
import type { Budget } from "@/features/budgets/types";
import { getPayableStatus } from "@/features/payables/payable-status";
import type { Payable } from "@/features/payables/types";
import { calculateReceivableFinancials } from "@/features/receivables/receivable-status";
import type { Receipt, Receivable } from "@/features/receivables/types";
import { isProjectLate, isProjectStartLate, projectDaysLate } from "@/features/projects/project-schedule";
import { buildProjectManagementSummary } from "@/features/projects/prototype/project-summary";
import type { Project } from "@/features/projects/types";
import type { ProjectCost } from "@/features/project-costs/types";
import {
  buildFinancialComparison,
  buildMonthlyCashMovement,
  buildProjectHealth,
  buildProjectHealthHighlights,
  lastNMonthKeys,
  summarizeMonthlyCashMovement,
  type FinancialComparisonEntry,
  type MonthlyCashMovementEntry,
  type ProjectHealthEntry,
  type ProjectHealthHighlights,
  type ProjectSummaryEntry,
} from "./dashboard-charts";

const UPCOMING_WINDOW_DAYS = 7;

export type DashboardAttentionType =
  | "payable-overdue"
  | "payable-upcoming"
  | "receivable-overdue"
  | "receivable-upcoming"
  | "project-over-budget"
  | "project-late"
  | "project-start-late"
  | "budget-pending"
  | "budget-unlinked";

export interface DashboardAttentionItem {
  /** Dedup key: `${type-independent origin}:${entity id}` — e.g.
   * `payable:{id}`. Two items can never share this key for the same
   * underlying entity, even across different render passes. A Project
   * CAN legitimately produce both a `project-late` item and a
   * `project-over-budget` item — those are different keys because
   * they are different problems, not a duplicate of the same one. */
  id: string;
  type: DashboardAttentionType;
  title: string;
  description?: string;
  amount?: number;
  dueDate?: string;
  href: string;
}

export interface DashboardSummary {
  projectsInProgress: number;
  /** Σ referenceAmount across all Projects — excludes approved Budgets
   * not yet linked to a Project (those surface as `budget-unlinked`
   * attention items instead). Never "Σ all approved budgets". */
  budgetedInProjects: number;
  totalRealizedCost: number;
  /** Σ overdue Payable.amount, including Payables with no projectId
   * (general/administrative expenses) — never combined with
   * Receivables. */
  overduePayablesTotal: number;
  overduePayablesCount: number;

  /** Same semantics as the `receivable-overdue` attentionItems —
   * outstandingAmount via `calculateReceivableFinancials`, never raw
   * `Receivable.amount`. Never combined with Payables. */
  overdueReceivablesTotal: number;
  overdueReceivablesCount: number;

  /** count(isProjectLate) — in_progress/paused only, see
   * `project-schedule.ts`. */
  projectsLate: number;
  /** Largest `daysLate` among late Projects — `null` (not 0) when
   * there are none, so "no late projects" is never confused with "the
   * latest one is exactly on time". */
  maxProjectDaysLate: number | null;

  pendingApprovalBudgetsCount: number;
  pendingApprovalBudgetsAmount: number;

  currentMonthRealizedCost: number;
  previousMonthRealizedCost: number;
  /** null when previousMonthRealizedCost is 0 — never Infinity, never
   * a fabricated percentage. The UI decides how to label null
   * (e.g. "Novo"/"—"), not this helper. */
  realizedCostMonthVariationPercent: number | null;

  financialComparison: FinancialComparisonEntry[];
  monthlyCashMovement: MonthlyCashMovementEntry[];
  /** Plain Σ of `monthlyCashMovement` — see `summarizeMonthlyCashMovement`. */
  receivedLast6Months: number;
  paidLast6Months: number;
  projectHealth: ProjectHealthEntry[];
  /** `projectHealth`, sorted/capped for display (see
   * `buildProjectHealthHighlights`) — a presentation selector, not a
   * new dataset; `projectHealth` itself is kept intact for any future
   * consumer that needs the full list. */
  projectHealthHighlights: ProjectHealthHighlights;

  attentionItems: DashboardAttentionItem[];
}

function daysFromToday(dateIso: string, today: string): number {
  const target = new Date(`${dateIso}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  return Math.round((target.getTime() - todayDate.getTime()) / 86_400_000);
}

function isUpcomingWithinWindow(dueDate: string, today: string): boolean {
  const days = daysFromToday(dueDate, today);
  return days > 0 && days <= UPCOMING_WINDOW_DAYS;
}

const ATTENTION_GROUP_PRIORITY: Record<DashboardAttentionType, number> = {
  "project-late": 0,
  "project-over-budget": 0,
  "payable-overdue": 1,
  "receivable-overdue": 1,
  "budget-pending": 2,
  "budget-unlinked": 3,
  "payable-upcoming": 4,
  "receivable-upcoming": 4,
  "project-start-late": 5,
};

function sortAttentionItems(items: DashboardAttentionItem[]): DashboardAttentionItem[] {
  return [...items].sort((a, b) => {
    const groupDiff = ATTENTION_GROUP_PRIORITY[a.type] - ATTENTION_GROUP_PRIORITY[b.type];
    if (groupDiff !== 0) return groupDiff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

export function buildDashboardSummary({
  projects,
  budgets,
  costs,
  payables,
  receivables,
  receipts,
}: {
  projects: Project[];
  budgets: Budget[];
  costs: ProjectCost[];
  payables: Payable[];
  receivables: Receivable[];
  receipts: Receipt[];
}): DashboardSummary {
  const today = todayIso();
  const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));

  const projectsInProgress = projects.filter((project) => project.status === "in_progress").length;

  // One buildProjectManagementSummary call per project, reused for
  // every project-derived figure below — never recomputed per section.
  const projectEntries: ProjectSummaryEntry[] = projects.map((project) => {
    const budget = project.budgetId ? (budgetById.get(project.budgetId) ?? null) : null;
    const projectCosts = costs.filter((cost) => cost.projectId === project.id);
    const summary = buildProjectManagementSummary({
      project,
      budget,
      costs: projectCosts,
      payables,
      receivables,
      receipts,
    });
    return { project, summary };
  });

  let budgetedInProjects = 0;
  let totalRealizedCost = 0;
  let projectsLate = 0;
  let maxProjectDaysLate: number | null = null;
  const attentionItems: DashboardAttentionItem[] = [];

  for (const { project, summary } of projectEntries) {
    if (summary.referenceAmount !== null) {
      budgetedInProjects += summary.referenceAmount;
    }
    totalRealizedCost += summary.realizedCost;

    if (summary.referenceAmount !== null && summary.realizedCost > summary.referenceAmount) {
      attentionItems.push({
        id: `project-over-budget:${project.id}`,
        type: "project-over-budget",
        title: `${project.name} está acima do orçamento`,
        amount: summary.realizedCost - summary.referenceAmount,
        href: `/obras/${project.id}`,
      });
    }

    const late = isProjectLate(project, today);
    if (late) {
      projectsLate += 1;
      const daysLate = projectDaysLate(project, today);
      maxProjectDaysLate = maxProjectDaysLate === null ? daysLate : Math.max(maxProjectDaysLate, daysLate);
      attentionItems.push({
        id: `project-late:${project.id}`,
        type: "project-late",
        title: `${project.name} está atrasada`,
        description: `${daysLate} dia${daysLate === 1 ? "" : "s"} de atraso`,
        href: `/obras/${project.id}`,
      });
    }

    if (isProjectStartLate(project, today)) {
      attentionItems.push({
        id: `project-start-late:${project.id}`,
        type: "project-start-late",
        title: `${project.name} ainda não começou`,
        description: "Início previsto já passou",
        dueDate: project.expectedStartDate,
        href: `/obras/${project.id}`,
      });
    }
  }

  let overduePayablesTotal = 0;
  let overduePayablesCount = 0;
  for (const payable of payables) {
    const status = getPayableStatus(payable);
    if (status === "overdue") {
      overduePayablesTotal += payable.amount;
      overduePayablesCount += 1;
      attentionItems.push({
        id: `payable:${payable.id}`,
        type: "payable-overdue",
        title: payable.description,
        description: payable.supplier,
        amount: payable.amount,
        dueDate: payable.dueDate,
        href: `/financeiro/contas-a-pagar/${payable.id}`,
      });
    } else if (status === "pending" && isUpcomingWithinWindow(payable.dueDate, today)) {
      attentionItems.push({
        id: `payable:${payable.id}`,
        type: "payable-upcoming",
        title: payable.description,
        description: payable.supplier,
        amount: payable.amount,
        dueDate: payable.dueDate,
        href: `/financeiro/contas-a-pagar/${payable.id}`,
      });
    }
  }

  const receiptsByReceivable = new Map<string, Receipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByReceivable.get(receipt.receivableId) ?? [];
    list.push(receipt);
    receiptsByReceivable.set(receipt.receivableId, list);
  }

  let overdueReceivablesTotal = 0;
  let overdueReceivablesCount = 0;
  for (const receivable of receivables) {
    const financials = calculateReceivableFinancials(
      receivable,
      receiptsByReceivable.get(receivable.id) ?? []
    );
    if (financials.displayStatus === "overdue") {
      overdueReceivablesTotal += financials.outstandingAmount;
      overdueReceivablesCount += 1;
      attentionItems.push({
        id: `receivable:${receivable.id}`,
        type: "receivable-overdue",
        title: receivable.description,
        amount: financials.outstandingAmount,
        dueDate: receivable.dueDate,
        href: `/financeiro/contas-a-receber/${receivable.id}`,
      });
    } else if (
      (financials.displayStatus === "pending" || financials.displayStatus === "partial") &&
      isUpcomingWithinWindow(receivable.dueDate, today)
    ) {
      attentionItems.push({
        id: `receivable:${receivable.id}`,
        type: "receivable-upcoming",
        title: receivable.description,
        amount: financials.outstandingAmount,
        dueDate: receivable.dueDate,
        href: `/financeiro/contas-a-receber/${receivable.id}`,
      });
    }
  }

  let pendingApprovalBudgetsCount = 0;
  let pendingApprovalBudgetsAmount = 0;
  for (const budget of budgets) {
    if (budget.status === "pending_approval") {
      pendingApprovalBudgetsCount += 1;
      pendingApprovalBudgetsAmount += calculateBudgetTotals(budget).total;
      attentionItems.push({
        id: `budget-pending:${budget.id}`,
        type: "budget-pending",
        title: budget.name,
        description: budget.customerName,
        amount: calculateBudgetTotals(budget).total,
        href: `/orcamentos/${budget.id}`,
      });
    } else if (budget.status === "approved" && !budget.projectId) {
      attentionItems.push({
        id: `budget-unlinked:${budget.id}`,
        type: "budget-unlinked",
        title: "Orçamento aprovado aguardando criação de obra",
        description: budget.name,
        amount: calculateBudgetTotals(budget).total,
        href: `/orcamentos/${budget.id}`,
      });
    }
  }

  const [previousMonthKey, currentMonthKey] = lastNMonthKeys(today, 2);
  let currentMonthRealizedCost = 0;
  let previousMonthRealizedCost = 0;
  for (const cost of costs) {
    const monthKey = cost.date.slice(0, 7);
    if (monthKey === currentMonthKey) currentMonthRealizedCost += cost.amount;
    else if (monthKey === previousMonthKey) previousMonthRealizedCost += cost.amount;
  }
  const realizedCostMonthVariationPercent =
    previousMonthRealizedCost > 0
      ? ((currentMonthRealizedCost - previousMonthRealizedCost) / previousMonthRealizedCost) * 100
      : null;

  const projectHealth = buildProjectHealth(projectEntries, today);
  const monthlyCashMovement = buildMonthlyCashMovement(payables, receipts, today);
  const { receivedLast6Months, paidLast6Months } = summarizeMonthlyCashMovement(monthlyCashMovement);

  return {
    projectsInProgress,
    budgetedInProjects,
    totalRealizedCost,
    overduePayablesTotal,
    overduePayablesCount,

    overdueReceivablesTotal,
    overdueReceivablesCount,

    projectsLate,
    maxProjectDaysLate,

    pendingApprovalBudgetsCount,
    pendingApprovalBudgetsAmount,

    currentMonthRealizedCost,
    previousMonthRealizedCost,
    realizedCostMonthVariationPercent,

    financialComparison: buildFinancialComparison(projectEntries),
    monthlyCashMovement,
    receivedLast6Months,
    paidLast6Months,
    projectHealth,
    projectHealthHighlights: buildProjectHealthHighlights(projectHealth),

    attentionItems: sortAttentionItems(attentionItems),
  };
}
