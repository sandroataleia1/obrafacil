/**
 * Pure "obras que precisam de atenção" prioritization (Demo-Ready
 * 010B §10/§11) — reads only `ProjectAnalyticsFacts`, never recomputes
 * a domain formula. Priority order, never persisted, always recomputed
 * on render:
 *
 *   1. orçamento ultrapassado   (budget.isOverBudget === true)
 *   2. contas a pagar vencidas  (payables.overdue > 0)
 *   3. recebíveis vencidos      (receivables.overdue > 0)
 *   4. materiais pendentes      (pendingToBuyCount/pendingToReceiveCount > 0)
 *
 * A project with no signal at all is excluded from the list entirely
 * — "demais obras" are simply not shown, never appended at the
 * bottom. `financialConsumptionPercent` alone never qualifies a
 * project for this list (Demo-Ready 010B §10: a high percentage is
 * informational, never an automatic alert) — it only ever appears as
 * context on an entry that already qualified through a real signal.
 */

import type { ProjectAnalyticsFacts } from "@/features/analytics/types";

export type ProjectAttentionReason =
  | "over-budget"
  | "overdue-payables"
  | "overdue-receivables"
  | "pending-materials";

export interface ProjectAttentionEntry {
  projectId: string;
  projectName: string;
  reason: ProjectAttentionReason;
  facts: ProjectAnalyticsFacts;
}

const REASON_PRIORITY: Record<ProjectAttentionReason, number> = {
  "over-budget": 0,
  "overdue-payables": 1,
  "overdue-receivables": 2,
  "pending-materials": 3,
};

function determineReason(facts: ProjectAnalyticsFacts): ProjectAttentionReason | null {
  if (facts.budget.isOverBudget === true) return "over-budget";
  if (facts.payables.overdue > 0) return "overdue-payables";
  if (facts.receivables.overdue > 0) return "overdue-receivables";
  if (facts.materials.pendingToBuyCount > 0 || facts.materials.pendingToReceiveCount > 0) {
    return "pending-materials";
  }
  return null;
}

export function buildProjectAttentionEntries(
  entries: Array<{ projectId: string; projectName: string; facts: ProjectAnalyticsFacts }>
): ProjectAttentionEntry[] {
  const withReason: ProjectAttentionEntry[] = [];
  for (const entry of entries) {
    const reason = determineReason(entry.facts);
    if (reason !== null) withReason.push({ ...entry, reason });
  }
  return withReason.sort((a, b) => REASON_PRIORITY[a.reason] - REASON_PRIORITY[b.reason]);
}
