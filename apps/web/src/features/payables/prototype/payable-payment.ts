/**
 * Coordinates marking a Payable as paid (and undoing it) with the
 * ProjectCost it may produce. Centralized here so the idempotency rule
 * — a Payable never produces more than one ProjectCost — lives in a
 * single place instead of being re-implemented in every screen that
 * touches payment state.
 */

import { todayIso } from "@/lib/date";
import {
  createProjectCostId,
  deleteProjectCostByOrigin,
  findProjectCostByOrigin,
  saveProjectCost,
} from "@/features/project-costs/prototype/project-cost-store";
import { getPayable, savePayable } from "./payable-store";
import type { Payable } from "../types";

export function markPayableAsPaid(payableId: string, paymentDate: string): Payable | null {
  const payable = getPayable(payableId);
  if (!payable) return null;

  const updated: Payable = { ...payable, paidAt: paymentDate, updatedAt: todayIso() };
  savePayable(updated);

  if (payable.projectId) {
    const existingCost = findProjectCostByOrigin("payable", payable.id);
    if (!existingCost) {
      saveProjectCost({
        id: createProjectCostId(),
        projectId: payable.projectId,
        date: paymentDate,
        category: payable.category,
        description: payable.description,
        amount: payable.amount,
        supplier: payable.supplier,
        originType: "payable",
        originId: payable.id,
        createdAt: todayIso(),
        updatedAt: todayIso(),
      });
    }
  }

  return updated;
}

export function undoPayablePayment(payableId: string): Payable | null {
  const payable = getPayable(payableId);
  if (!payable) return null;

  if (payable.projectId) {
    deleteProjectCostByOrigin("payable", payable.id);
  }

  const updated: Payable = { ...payable, paidAt: undefined, updatedAt: todayIso() };
  savePayable(updated);
  return updated;
}
