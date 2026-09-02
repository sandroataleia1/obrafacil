/**
 * Pure, non-persisted financial summary for one PurchaseOrder, derived
 * from `purchaseTotal` (see `purchase-totals.ts`) and the Payables it
 * generated (see `purchase-payable.ts`/`listPayablesByOrigin`). Never
 * persisted, never synced back onto the PurchaseOrder or its Payables
 * — editing the purchase's items after Payables exist simply changes
 * `uncoveredAmount`/`overGeneratedAmount`; editing/paying/deleting a
 * Payable simply changes the totals on the next read. Nothing here
 * ever mutates a Payable, ProjectCost, GoodsReceipt, or
 * MaterialConsumption.
 *
 * Uses `toCents()` throughout to avoid float drift when comparing
 * `purchaseTotal` against the sum of several Payables. Reuses
 * `getPayableStatus` (see `features/payables/payable-status.ts`) for
 * paid/overdue instead of re-deriving them from `paidAt`/`dueDate`
 * here, so there is exactly one place that knows what "overdue" means
 * (Task 043A).
 */

import { toCents } from "@/lib/currency";
import { getPayableStatus } from "@/features/payables/payable-status";
import type { Payable } from "@/features/payables/types";

export interface PurchaseFinancialSummary {
  purchaseTotal: number;
  generatedPayables: number;
  paidPayables: number;
  pendingPayables: number;
  overduePayables: number;
  uncoveredAmount: number;
  overGeneratedAmount: number;
}

export function calculatePurchaseFinancialSummary(
  purchaseTotal: number,
  payables: Payable[]
): PurchaseFinancialSummary {
  const purchaseTotalCents = toCents(purchaseTotal);

  let generatedCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  let overdueCents = 0;

  for (const payable of payables) {
    const amountCents = toCents(payable.amount);
    generatedCents += amountCents;
    const status = getPayableStatus(payable);
    if (status === "paid") {
      paidCents += amountCents;
    } else {
      pendingCents += amountCents;
      if (status === "overdue") overdueCents += amountCents;
    }
  }

  const uncoveredCents = Math.max(purchaseTotalCents - generatedCents, 0);
  const overGeneratedCents = Math.max(generatedCents - purchaseTotalCents, 0);

  return {
    purchaseTotal: purchaseTotalCents / 100,
    generatedPayables: generatedCents / 100,
    paidPayables: paidCents / 100,
    pendingPayables: pendingCents / 100,
    overduePayables: overdueCents / 100,
    uncoveredAmount: uncoveredCents / 100,
    overGeneratedAmount: overGeneratedCents / 100,
  };
}
