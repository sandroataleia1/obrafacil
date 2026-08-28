import { todayIso } from "@/lib/date";
import type { Payable, PayableStatus, PayableStatusFilter } from "./types";

export function getPayableStatus(payable: Payable): PayableStatus {
  if (payable.paidAt) return "paid";
  return payable.dueDate < todayIso() ? "overdue" : "pending";
}

export function matchesStatusFilter(payable: Payable, filter: PayableStatusFilter): boolean {
  if (filter === "all") return true;
  const status = getPayableStatus(payable);
  if (filter === "open") return status === "pending" || status === "overdue";
  return status === filter;
}

/**
 * Short, human phrase for a due date relative to today ("Vence hoje",
 * "Vencida há 2 dias"). Returns null when the absolute date is clear
 * enough on its own (more than a day away in the future).
 */
export function describeDueDate(dueDate: string): string | null {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return "Vence hoje";
  if (diffDays === 1) return "Vence amanhã";
  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return `Vencida há ${days} dia${days > 1 ? "s" : ""}`;
  }
  return null;
}
