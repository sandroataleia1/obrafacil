/**
 * Pure aggregation over a list of Receivables. Takes a `receiptsFor`
 * lookup instead of reading the store itself, so it stays usable both
 * for the global list (all receivables) and for a single Project's
 * subset without duplicating the summing logic.
 */

import { calculateReceivableFinancials } from "../receivable-status";
import type { Receipt, Receivable } from "../types";

export interface ReceivableTotals {
  totalReceivable: number;
  totalReceived: number;
  totalOutstanding: number;
  overdueOutstanding: number;
  upcomingOutstanding: number;
}

export function calculateReceivableTotals(
  receivables: Receivable[],
  receiptsFor: (receivableId: string) => Receipt[]
): ReceivableTotals {
  let totalReceivable = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  let overdueOutstanding = 0;

  for (const receivable of receivables) {
    const { receivedAmount, outstandingAmount, isOverdue } = calculateReceivableFinancials(
      receivable,
      receiptsFor(receivable.id)
    );
    totalReceivable += receivable.amount;
    totalReceived += receivedAmount;
    totalOutstanding += outstandingAmount;
    if (isOverdue) overdueOutstanding += outstandingAmount;
  }

  return {
    totalReceivable,
    totalReceived,
    totalOutstanding,
    overdueOutstanding,
    upcomingOutstanding: totalOutstanding - overdueOutstanding,
  };
}
