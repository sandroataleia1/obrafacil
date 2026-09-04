/**
 * Pure label formatting over already-derived DashboardSummary/
 * ProjectHealthEntry numbers — no financial/schedule rule lives here,
 * only deterministic text composition, so it isn't duplicated across
 * KPI cards, the attention summary, the health list and any future
 * consumer.
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

export function formatOverduePayablesCountText(count: number): string {
  return `${count} conta${count === 1 ? "" : "s"} vencida${count === 1 ? "" : "s"}`;
}

export function formatOverdueReceivablesCountText(count: number): string {
  return `${count} recebimento${count === 1 ? "" : "s"} vencido${count === 1 ? "" : "s"}`;
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

/** Compact axis-tick label ("R$ 5 mil") — the tooltip keeps full BRL
 * separately; this is only for the chart axis, never the number the
 * user reads to make a decision. */
export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) < 1000) return formatCurrency(value);
  const thousands = value / 1000;
  const formatted = thousands.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `R$ ${formatted} mil`;
}

interface ScheduleStatusInput {
  status: ProjectStatus;
  isLate: boolean;
  daysLate: number;
  isStartLate: boolean;
  expectedEndDate?: string;
}

export interface ScheduleStatusLines {
  primary: string;
  secondary?: string;
}

/** No `actualEndDate` exists, so a `completed` Project is never judged
 * "on time" or "late" — only "Concluída". */
export function buildScheduleStatusLines(entry: ScheduleStatusInput): ScheduleStatusLines {
  if (entry.status === "completed") return { primary: "Concluída" };
  if (entry.status === "planning") {
    return entry.isStartLate ? { primary: "Início atrasado" } : { primary: "Planejada" };
  }
  if (entry.isLate) {
    return {
      primary: `Atrasada ${entry.daysLate} dia${entry.daysLate === 1 ? "" : "s"}`,
      secondary: entry.expectedEndDate ? `Prevista: ${formatDate(entry.expectedEndDate)}` : undefined,
    };
  }
  if (entry.expectedEndDate) {
    return { primary: "No prazo", secondary: `Prevista: ${formatDate(entry.expectedEndDate)}` };
  }
  return { primary: "Sem prazo definido" };
}

interface FinancialSummaryInput {
  referenceAmount: number | null;
  realizedCost: number;
  committedCost: number;
  budgetUsage: number | null;
}

export interface FinancialSummaryLines {
  primary: string;
  secondary?: string;
}

/** Groups the three money figures into one readable pair of lines
 * instead of three separate columns — never "— / — / —" as the main
 * message when there's simply no reference budget. */
export function buildFinancialSummaryLines(entry: FinancialSummaryInput): FinancialSummaryLines {
  if (entry.referenceAmount === null || entry.budgetUsage === null) {
    return {
      primary: "Sem orçamento de referência",
      secondary: entry.realizedCost > 0 ? `Realizado: ${formatCurrency(entry.realizedCost)}` : undefined,
    };
  }
  return {
    primary: `${formatCurrency(entry.committedCost)} comprometidos de ${formatCurrency(entry.referenceAmount)}`,
    secondary: `${Math.round(entry.budgetUsage * 100)}% do orçamento comprometido · Realizado: ${formatCurrency(entry.realizedCost)}`,
  };
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
