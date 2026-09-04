/**
 * Read-only contracts for management indicators (Demo-Ready 010A).
 *
 * Every field here was included ONLY because Demo-Ready 010A's
 * architectural audit classified it as EXATA — computable today from
 * existing domain data without heuristics or assumptions. Fields the
 * audit classified APROXIMÁVEL or INDISPONÍVEL are deliberately
 * absent: contracted revenue, current/projected margin, committed/
 * projected cost, projected cash flow, per-project labor cost without
 * an EmployeePeriodAllocation, physical progress, EAC, productivity,
 * real profit. Do not add them here without a new architectural
 * decision — see the 010A audit report for the full reasoning.
 *
 * All facts are DERIVED, never persisted. Nothing in this module
 * reads or writes localStorage — every builder takes already-loaded
 * domain data as input (see `company-analytics.ts`/`project-analytics.ts`),
 * the same convention `features/projects/prototype/project-summary.ts`
 * already established.
 */

import type { ProjectStatus } from "@/features/projects/types";

export interface ProjectStatusCounts {
  planning: number;
  inProgress: number;
  paused: number;
  completed: number;
}

export const PROJECT_STATUS_TO_COUNT_KEY: Record<ProjectStatus, keyof ProjectStatusCounts> = {
  planning: "planning",
  in_progress: "inProgress",
  paused: "paused",
  completed: "completed",
};

/**
 * Company-wide financial obligations — never mixed with
 * `projectCosts.realizedProjectCosts` in the same total (see
 * `company-analytics.ts` doc comment: obrigações financeiras and
 * custos das obras are kept semantically separate, per Demo-Ready
 * 010A §19/§27).
 */
export interface CompanyFinanceFacts {
  pendingPayables: number;
  overduePayables: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  receivedRevenue: number;
}

/** A snapshot of team allocation as of one reference civil date ("hoje"). */
export interface TeamSnapshotFacts {
  referenceDate: string;
  activeEmployees: number;
  allocatedEmployees: number;
  unallocatedEmployees: number;
  multiProjectEmployees: number;
}

/**
 * Sum of `estimatedPay` across whatever `EmployeeWorkPeriod`s already
 * exist for one "YYYY-MM" period — explicitly NOT a guaranteed
 * payroll total. `existingPeriodsCount`/`employeesWithoutPeriodCount`
 * let a consumer tell whether the number is complete or partial; no
 * period is ever created to fill this gap (Demo-Ready 010A §14/§15).
 */
export interface WorkforcePeriodFacts {
  period: string;
  estimatedValueOfExistingPeriods: number;
  existingPeriodsCount: number;
  employeesWithoutPeriodCount: number;
  /** Active employees with no `EmployeeWorkPeriod` for `period` — kept as a lightweight id list (not full records) for drill-down. */
  employeesWithoutPeriodIds: string[];
}

export interface CompanyAnalyticsFacts {
  projects: ProjectStatusCounts;
  finance: CompanyFinanceFacts;
  team: TeamSnapshotFacts;
  workforcePeriod: WorkforcePeriodFacts;
  /** `ProjectCost` is scoped to obras — never call this "custo total da empresa": administrative Payables without a `projectId` never appear here (Demo-Ready 010A §9). */
  projectCosts: {
    realizedProjectCosts: number;
  };
}

/**
 * `budgetedCost`/`budgetSaleTotal`/`budgetMarginAmount` are three
 * distinct numbers, never conflated:
 *   budgetedCost      = Budget.costTotal (materials+labor+manual — no margin)
 *   budgetSaleTotal    = Budget.total (costTotal marked up by margin, minus discount)
 *   budgetMarginAmount = Budget.marginAmount
 * `remainingBudget`/`financialConsumptionPercent`/`isOverBudget` are
 * computed against `budgetedCost` (cost vs. cost), a different, more
 * conservative comparison than the sale-price-based
 * `referenceAmount`/`remainingAgainstBudget` already exposed by
 * `buildProjectManagementSummary` — this is an additional fact, not a
 * duplicate (Demo-Ready 010A §6/§7/§9).
 * `null` means "no approved Budget linked" — never confused with 0.
 * `remainingBudget` is NOT clamped at zero: a negative value is the
 * signal that realized cost overran the cost budget.
 */
export interface ProjectBudgetFacts {
  budgetedCost: number | null;
  budgetSaleTotal: number | null;
  budgetMarginAmount: number | null;
  realizedCost: number;
  remainingBudget: number | null;
  financialConsumptionPercent: number | null;
  isOverBudget: boolean | null;
}

export interface ProjectFinancePayablesFacts {
  pending: number;
  overdue: number;
}

export interface ProjectFinanceReceivablesFacts {
  received: number;
  outstanding: number;
  overdue: number;
}

/**
 * Counts of MaterialRequirement LINES with pending quantity — never a
 * summed quantity across materials of different units (Demo-Ready
 * 010A §20: "10 sacos + 8 m² + 3 unidades" is not a valid total).
 */
export interface ProjectMaterialsFacts {
  pendingToBuyCount: number;
  pendingToReceiveCount: number;
}

export interface ProjectAnalyticsFacts {
  projectId: string;
  budget: ProjectBudgetFacts;
  payables: ProjectFinancePayablesFacts;
  receivables: ProjectFinanceReceivablesFacts;
  materials: ProjectMaterialsFacts;
}
