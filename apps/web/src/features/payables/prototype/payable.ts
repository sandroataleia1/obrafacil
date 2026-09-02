/**
 * Domain operations for editing/removing a Payable — the invariants
 * this module enforces are NOT just UI conveniences (hidden form
 * fields, a hidden delete button): `payable-store.ts` is pure
 * persistence with zero guards, so anything that wrote a `Payable`
 * directly (a form bug, a future screen, a script) could silently
 * rewrite an origin's frozen fields or delete/edit a paid Payable
 * without this module (see Task 043A audit). Every write path that
 * isn't "create a brand-new manual Payable" must go through here.
 *
 * Two independent rules, both enforced regardless of what the caller
 * passes in:
 *
 * 1. Origin immutability — once a Payable has an `originType`, its
 *    `originType`/`originId`/`projectId`/`supplier`/`category` are
 *    frozen to the values it was created with (they derive from the
 *    origin record, never from a form). `"employee-period"` is even
 *    stricter, matching its pre-existing rule: `description`/`amount`
 *    are frozen too — only `dueDate`/`notes` are editable.
 *    `"purchase-order"` allows `description`/`amount`/`dueDate`/`notes`.
 *    A manual Payable (`originType: undefined`) has none of these
 *    restrictions.
 *
 * 2. Paid is read-only — once `paidAt` is set, a Payable can be
 *    neither edited nor deleted through this module, full stop. This
 *    is the deliberate v1 answer to "amount edited after payment"
 *    and "paid Payable deleted": block, rather than build a
 *    Payable<->ProjectCost sync mechanism. To change a paid Payable,
 *    `undoPayablePayment` first (see `payable-payment.ts`), which
 *    removes the ProjectCost it produced, then edit/delete normally.
 */

import { toCents } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import type { ProjectCostCategory } from "@/features/project-costs/types";
import { deletePayable, savePayable } from "./payable-store";
import type { Payable } from "../types";

export type PayableResult = { ok: true; payable: Payable } | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

export interface PayableChanges {
  description: string;
  supplier?: string;
  category: ProjectCostCategory;
  amount: number;
  dueDate: string;
  projectId?: string;
  notes?: string;
}

export function updatePayable(existing: Payable, changes: PayableChanges): PayableResult {
  if (existing.paidAt) {
    return { ok: false, error: "Contas pagas não podem ser editadas. Desfaça o pagamento primeiro." };
  }
  if (changes.dueDate.trim() === "") {
    return { ok: false, error: "Informe o vencimento." };
  }

  if (existing.originType === "employee-period") {
    // Description/supplier/category/amount are a financial snapshot of
    // the period — only dueDate/notes are editable (pre-existing rule,
    // now enforced here instead of only in the form).
    const updated: Payable = {
      ...existing,
      dueDate: changes.dueDate,
      notes: changes.notes?.trim() || undefined,
      updatedAt: todayIso(),
    };
    savePayable(updated);
    return { ok: true, payable: updated };
  }

  if (changes.description.trim() === "") {
    return { ok: false, error: "Informe uma descrição." };
  }
  if (!(toCents(changes.amount) > 0)) {
    return { ok: false, error: "Informe um valor maior que zero." };
  }

  if (existing.originType === "purchase-order") {
    // projectId/supplier/category/originType/originId derive from the
    // PurchaseOrder and are frozen — always taken from `existing`,
    // never from `changes`, no matter what the caller passed.
    const updated: Payable = {
      ...existing,
      description: changes.description.trim(),
      amount: changes.amount,
      dueDate: changes.dueDate,
      notes: changes.notes?.trim() || undefined,
      updatedAt: todayIso(),
    };
    savePayable(updated);
    return { ok: true, payable: updated };
  }

  // Manual Payable (no origin) — every field below is editable.
  const updated: Payable = {
    ...existing,
    description: changes.description.trim(),
    supplier: changes.supplier?.trim() || undefined,
    category: changes.category,
    amount: changes.amount,
    dueDate: changes.dueDate,
    projectId: changes.projectId,
    notes: changes.notes?.trim() || undefined,
    updatedAt: todayIso(),
  };
  savePayable(updated);
  return { ok: true, payable: updated };
}

export function removePayable(payable: Payable): DomainResult {
  if (payable.paidAt) {
    return { ok: false, error: "Contas pagas não podem ser excluídas. Desfaça o pagamento primeiro." };
  }
  deletePayable(payable.id);
  return { ok: true };
}
