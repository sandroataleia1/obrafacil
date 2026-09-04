/**
 * Shared Payable/Receivable aggregation for the analytics layer — used
 * by both `company-analytics.ts` (no project filter) and
 * `project-analytics.ts` (filtered by `projectId` by the caller before
 * calling these). Reuses the existing status derivation
 * (`getPayableStatus`, `calculateReceivableTotals`) instead of
 * re-deriving pending/overdue here — the same rule
 * `buildProjectManagementSummary` already follows (Demo-Ready 010A §5).
 *
 * Pure functions only — no store reads, no writes.
 */

import { getPayableStatus } from "@/features/payables/payable-status";
import type { Payable } from "@/features/payables/types";
import { calculateReceivableTotals } from "@/features/receivables/prototype/receivable-totals";
import type { Receipt, Receivable } from "@/features/receivables/types";

export interface PayableAggregate {
  pending: number;
  overdue: number;
}

export function aggregatePayables(payables: Payable[]): PayableAggregate {
  let pending = 0;
  let overdue = 0;
  for (const payable of payables) {
    const status = getPayableStatus(payable);
    if (status === "pending" || status === "overdue") {
      pending += payable.amount;
      if (status === "overdue") overdue += payable.amount;
    }
  }
  return { pending, overdue };
}

export interface ReceivableAggregate {
  received: number;
  outstanding: number;
  overdue: number;
}

export function aggregateReceivables(
  receivables: Receivable[],
  receiptsFor: (receivableId: string) => Receipt[]
): ReceivableAggregate {
  const totals = calculateReceivableTotals(receivables, receiptsFor);
  return {
    received: totals.totalReceived,
    outstanding: totals.totalOutstanding,
    overdue: totals.overdueOutstanding,
  };
}
