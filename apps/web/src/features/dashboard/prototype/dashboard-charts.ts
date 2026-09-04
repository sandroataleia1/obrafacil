/**
 * Pure dataset builders for the executive Dashboard's charts and
 * "Saúde das obras" section. No React, no store reads — everything
 * takes data the caller already loaded, mirroring
 * `dashboard-summary.ts`. Composes `ProjectManagementSummary` (already
 * computed once per project by the caller) rather than recalculating
 * any financial concept.
 */

import type { Payable } from "@/features/payables/types";
import { isProjectLate, isProjectStartLate, projectDaysLate } from "@/features/projects/project-schedule";
import type { Project, ProjectStatus } from "@/features/projects/types";
import type { ProjectManagementSummary } from "@/features/projects/prototype/project-summary";
import type { Receipt } from "@/features/receivables/types";

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** `n` month keys ("YYYY-MM"), oldest first, ending at the month of
 * `today` — pure year/month integer arithmetic, no Date object, so
 * there is no timezone boundary to cross. */
export function lastNMonthKeys(today: string, n: number): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7)); // 1-12
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}

export function monthLabelFromKey(monthKey: string): string {
  const year = monthKey.slice(0, 4);
  const month = Number(monthKey.slice(5, 7));
  return `${MONTH_LABELS[month - 1]}/${year.slice(2)}`;
}

export interface MonthlyCashMovementTotals {
  receivedLast6Months: number;
  paidLast6Months: number;
}

/** Plain Σ over the already-built 6-bucket dataset — not a new
 * financial concept, just a total of what the chart already shows. */
export function summarizeMonthlyCashMovement(
  monthly: MonthlyCashMovementEntry[]
): MonthlyCashMovementTotals {
  return {
    receivedLast6Months: monthly.reduce((sum, bucket) => sum + bucket.received, 0),
    paidLast6Months: monthly.reduce((sum, bucket) => sum + bucket.paid, 0),
  };
}

export interface ProjectSummaryEntry {
  project: Project;
  summary: ProjectManagementSummary;
}

export interface FinancialComparisonEntry {
  projectId: string;
  projectName: string;
  referenceAmount: number;
  realizedCost: number;
  committedCost: number;
}

/** Obras não concluídas com orçamento de referência > 0, ordenadas por
 * referenceAmount desc, no máximo 6 — realizedCost/committedCost em 0
 * é um valor real e nunca é motivo para excluir a obra. */
export function buildFinancialComparison(entries: ProjectSummaryEntry[]): FinancialComparisonEntry[] {
  return entries
    .filter(({ project }) => project.status !== "completed")
    .filter(({ summary }) => summary.referenceAmount !== null && summary.referenceAmount > 0)
    .sort((a, b) => (b.summary.referenceAmount as number) - (a.summary.referenceAmount as number))
    .slice(0, 6)
    .map(({ project, summary }) => ({
      projectId: project.id,
      projectName: project.name,
      referenceAmount: summary.referenceAmount as number,
      realizedCost: summary.realizedCost,
      committedCost: summary.committedCost,
    }));
}

export interface MonthlyCashMovementEntry {
  monthKey: string;
  monthLabel: string;
  received: number;
  paid: number;
}

/** Exactly 6 entries (current month + 5 previous), oldest first, every
 * month present even at zero. `received` sums Receipt.amount by
 * receivedAt; `paid` sums Payable.amount by paidAt (only Payables that
 * actually have one) — never Receivable.amount, ProjectCost, Budget,
 * or committedCost. Both fields are plain "YYYY-MM-DD" strings, so the
 * month key is a direct slice — no Date parsing, no timezone risk. */
export function buildMonthlyCashMovement(
  payables: Payable[],
  receipts: Receipt[],
  today: string
): MonthlyCashMovementEntry[] {
  const monthKeys = lastNMonthKeys(today, 6);

  const receivedByMonth = new Map<string, number>();
  for (const receipt of receipts) {
    const key = receipt.receivedAt.slice(0, 7);
    receivedByMonth.set(key, (receivedByMonth.get(key) ?? 0) + receipt.amount);
  }

  const paidByMonth = new Map<string, number>();
  for (const payable of payables) {
    if (!payable.paidAt) continue;
    const key = payable.paidAt.slice(0, 7);
    paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + payable.amount);
  }

  return monthKeys.map((monthKey) => ({
    monthKey,
    monthLabel: monthLabelFromKey(monthKey),
    received: receivedByMonth.get(monthKey) ?? 0,
    paid: paidByMonth.get(monthKey) ?? 0,
  }));
}

export interface ProjectHealthFlags {
  overBudget: boolean;
  committedOverBudget: boolean;
  hasOverduePayables: boolean;
  late: boolean;
  startLate: boolean;
}

export interface ProjectHealthEntry {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  referenceAmount: number | null;
  realizedCost: number;
  committedCost: number;
  /** committedCost / referenceAmount — financial commitment against
   * the budget, `null` when there is no reference amount. This is NOT
   * physical/executed progress. */
  budgetUsage: number | null;
  expectedEndDate?: string;
  isLate: boolean;
  daysLate: number;
  isStartLate: boolean;
  healthFlags: ProjectHealthFlags;
}

/** All Projects (every status) — "Saúde das obras" is meant as a full
 * operational picture, not a filtered highlight list. Flags are kept
 * independent/explicit (not collapsed into one verdict) so each cause
 * survives; a single display badge, if ever needed, is a 007D-C UI
 * decision built on top of these flags, not a new rule here. */
export function buildProjectHealth(entries: ProjectSummaryEntry[], today: string): ProjectHealthEntry[] {
  return entries.map(({ project, summary }) => {
    const referenceAmount = summary.referenceAmount;
    const budgetUsage =
      referenceAmount !== null && referenceAmount > 0 ? summary.committedCost / referenceAmount : null;
    const late = isProjectLate(project, today);
    const startLate = isProjectStartLate(project, today);

    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      referenceAmount,
      realizedCost: summary.realizedCost,
      committedCost: summary.committedCost,
      budgetUsage,
      expectedEndDate: project.expectedEndDate,
      isLate: late,
      daysLate: projectDaysLate(project, today),
      isStartLate: startLate,
      healthFlags: {
        overBudget: referenceAmount !== null && summary.realizedCost > referenceAmount,
        committedOverBudget: referenceAmount !== null && summary.committedCost > referenceAmount,
        hasOverduePayables: summary.overduePayables > 0,
        late,
        startLate,
      },
    };
  });
}

export interface ProjectHealthHighlights {
  items: ProjectHealthEntry[];
  totalCount: number;
}

/** First matching condition wins, in this fixed order — a project is
 * ranked by the single most urgent reason it needs attention, not by
 * how many reasons apply. */
function healthRank(entry: ProjectHealthEntry): number {
  if (entry.healthFlags.late) return 0;
  if (entry.healthFlags.overBudget) return 1;
  if (entry.healthFlags.committedOverBudget) return 2;
  if (entry.healthFlags.hasOverduePayables) return 3;
  if (entry.healthFlags.startLate) return 4;
  if (entry.status === "in_progress") return 5;
  if (entry.status === "paused") return 6;
  if (entry.status === "planning") return 7;
  return 8; // completed
}

/** Pure presentation selector over an already-built `ProjectHealth`
 * list — no new financial/schedule rule, just a deterministic sort
 * (rank, then committedCost desc, then name) and a cap. `totalCount`
 * always reflects the full list, so the caller can render "+N outras
 * obras" honestly instead of pretending there are only `max`. */
export function buildProjectHealthHighlights(
  health: ProjectHealthEntry[],
  max = 6
): ProjectHealthHighlights {
  const sorted = [...health].sort((a, b) => {
    const rankDiff = healthRank(a) - healthRank(b);
    if (rankDiff !== 0) return rankDiff;
    if (b.committedCost !== a.committedCost) return b.committedCost - a.committedCost;
    return a.projectName.localeCompare(b.projectName);
  });
  return { items: sorted.slice(0, max), totalCount: health.length };
}
