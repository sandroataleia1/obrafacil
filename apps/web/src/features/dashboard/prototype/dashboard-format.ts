/**
 * Pure label formatting over already-derived DashboardSummary/
 * ProjectHealthEntry numbers — no financial/schedule rule lives here,
 * only deterministic text composition, so it isn't duplicated across
 * KPI cards, the health list and any future consumer.
 */

import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import type { ProjectHealthFlags } from "./dashboard-charts";
import type { ProjectStatus } from "@/features/projects/types";

export function formatMaxDaysLateText(maxDaysLate: number | null): string {
  if (maxDaysLate === null) return "Nenhuma obra atrasada";
  return `Maior atraso: ${maxDaysLate} dia${maxDaysLate === 1 ? "" : "s"}`;
}

export function formatPendingApprovalSecondaryText(amount: number): string {
  return `${formatCurrency(amount)} em propostas`;
}

/** previous>0 → percent variation; previous=0 & current>0 → "Novo"; both
 * zero → neutral "sem custo" — never a fabricated +100%/Infinity. */
export function formatRealizedCostSecondaryText(
  currentMonthRealizedCost: number,
  previousMonthRealizedCost: number,
  realizedCostMonthVariationPercent: number | null
): string {
  const amountLabel = `${formatCurrency(currentMonthRealizedCost)} neste mês`;
  if (previousMonthRealizedCost === 0 && currentMonthRealizedCost === 0) {
    return "Sem custo neste mês";
  }
  if (previousMonthRealizedCost === 0) {
    return `${amountLabel} · Novo neste mês`;
  }
  if (realizedCostMonthVariationPercent === null) return amountLabel;
  const sign = realizedCostMonthVariationPercent >= 0 ? "+" : "";
  return `${amountLabel} · ${sign}${realizedCostMonthVariationPercent.toFixed(0)}% vs. mês anterior`;
}

interface ScheduleStatusInput {
  status: ProjectStatus;
  isLate: boolean;
  daysLate: number;
  isStartLate: boolean;
  expectedEndDate?: string;
}

/** No `actualEndDate` exists, so a `completed` Project is never judged
 * "on time" or "late" — only "Concluída". */
export function formatScheduleStatusText(entry: ScheduleStatusInput): string {
  if (entry.status === "completed") return "Concluída";
  if (entry.status === "planning") {
    return entry.isStartLate ? "Início atrasado" : "Planejada";
  }
  if (entry.isLate) {
    return `Atrasada ${entry.daysLate} dia${entry.daysLate === 1 ? "" : "s"}`;
  }
  if (entry.expectedEndDate) {
    return `Previsão: ${formatDate(entry.expectedEndDate)}`;
  }
  return "Sem prazo definido";
}

/** At most `maxBadges` labels, most relevant first — never all five
 * flags at once, to avoid crowding a single row. overBudget and
 * committedOverBudget never both render (the former already implies
 * the latter). */
export function buildHealthBadges(flags: ProjectHealthFlags, maxBadges = 2): string[] {
  const badges: string[] = [];
  if (flags.late) badges.push("Atrasada");
  if (flags.overBudget) badges.push("Acima do orçamento");
  else if (flags.committedOverBudget) badges.push("Comprometido acima do orçamento");
  if (flags.hasOverduePayables) badges.push("Conta vencida");
  if (flags.startLate) badges.push("Início atrasado");
  return badges.slice(0, maxBadges);
}
