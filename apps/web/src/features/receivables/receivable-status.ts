import { toCents } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import type {
  Receipt,
  Receivable,
  ReceivableDisplayStatus,
  ReceivableStatusFilter,
} from "./types";

export interface ReceivableFinancials {
  receivedAmount: number;
  outstandingAmount: number;
  isOverdue: boolean;
  displayStatus: ReceivableDisplayStatus;
}

/**
 * Single source of truth for every derived number/state of a
 * Receivable, so the list, the detail screen, and the totals helper
 * can never disagree with each other. All comparisons happen in
 * integer cents (see `toCents`) to avoid float boundary errors on the
 * `outstanding === 0` / overpayment checks.
 */
export function calculateReceivableFinancials(
  receivable: Receivable,
  receipts: Receipt[]
): ReceivableFinancials {
  const receivedCents = receipts.reduce((sum, receipt) => sum + toCents(receipt.amount), 0);
  const outstandingCents = Math.max(toCents(receivable.amount) - receivedCents, 0);
  const isOverdue = outstandingCents > 0 && receivable.dueDate < todayIso();

  let displayStatus: ReceivableDisplayStatus;
  if (outstandingCents === 0) {
    displayStatus = "received";
  } else if (isOverdue) {
    displayStatus = "overdue";
  } else if (receivedCents > 0) {
    displayStatus = "partial";
  } else {
    displayStatus = "pending";
  }

  return {
    receivedAmount: receivedCents / 100,
    outstandingAmount: outstandingCents / 100,
    isOverdue,
    displayStatus,
  };
}

export function matchesReceivableStatusFilter(
  displayStatus: ReceivableDisplayStatus,
  filter: ReceivableStatusFilter
): boolean {
  if (filter === "all") return true;
  return displayStatus === filter;
}

/**
 * Short, human phrase for a due date relative to today. Mirrors
 * `features/payables/payable-status.ts#describeDueDate` exactly.
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
