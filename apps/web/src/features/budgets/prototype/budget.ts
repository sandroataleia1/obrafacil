/**
 * Domain operations for Budget — editing basic metadata, deleting, and
 * the public proposal decision (approve/reject). `budget-store.ts` is
 * pure persistence with zero guards, so every invariant below lives
 * here instead — mirrors `features/payables/prototype/payable.ts` and
 * `features/purchases/prototype/purchase-order.ts` (Demo-Ready 002).
 *
 * Final workflow (Demo-Ready 002A), congelado para esta v1:
 *
 *   draft -> pending_approval -> approved
 *   draft -> pending_approval -> rejected
 *
 * `submitBudgetForApproval` is the only way out of `draft`, and only
 * `approveBudgetProposal`/`rejectBudgetProposal` (both requiring
 * `pending_approval`) move it further. No other transition exists:
 * no `approved`/`rejected -> anything`, no `pending_approval -> draft`
 * rollback, no revision/new-version/resend flow. To revise a decided
 * proposal in this v1, the business creates a new Budget.
 *
 * `"draft"` and `"pending_approval"` are both "not yet decided" — a
 * Budget in either status is editable (metadata AND composition —
 * stages/margin/discount, see `updateBudgetComposition`) and
 * deletable. `"approved"` and `"rejected"` are terminal: EVERYTHING
 * that composes the proposal — name, customer, reference, stages
 * (add/remove/edit), margin, discount, status, proposalToken — is
 * frozen from that point on. There is no separate "snapshot" entity:
 * the Budget record itself, once terminal, IS the immutable snapshot
 * the public proposal renders — every write path in this module
 * checks `isEditable` first, so nothing (UI bug, future caller,
 * direct domain call) can mutate a decided proposal after the fact.
 *
 * `Budget.stages` are embedded on the record itself, not a separate
 * store — deleting a Budget removes its stages atomically, with no
 * orphan risk. A calculator's pending item
 * (`prototype/pending-budget-item.ts`) is a short-lived handoff
 * already consumed at creation time; nothing external to preserve or
 * cascade.
 */

import { todayIso } from "@/lib/date";
import { getCustomer } from "@/features/customers/prototype/customer-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { deleteBudget as deleteBudgetRecord, saveBudget } from "./budget-store";
import type { Budget, BudgetStatus } from "../types";

export type BudgetResult = { ok: true; budget: Budget } | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

const EDITABLE_STATUSES: BudgetStatus[] = ["draft", "pending_approval"];

function isEditable(budget: Budget): boolean {
  return EDITABLE_STATUSES.includes(budget.status);
}

export interface BudgetDetailsChanges {
  name: string;
  customerId: string;
  projectReference?: string;
}

/** Basic metadata only — name/customer/reference. Stages, margin,
 * discount, status, and proposalToken are untouched here; stage/
 * margin/discount editing keeps its own existing mechanism in
 * `budget-detail.tsx`, out of scope for this task. */
export function updateBudgetDetails(existing: Budget, changes: BudgetDetailsChanges): BudgetResult {
  if (!isEditable(existing)) {
    return { ok: false, error: "Orçamentos aprovados ou recusados não podem ser editados." };
  }
  if (changes.name.trim() === "") {
    return { ok: false, error: "Informe o nome do orçamento." };
  }
  const customer = getCustomer(changes.customerId);
  if (!customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const updated: Budget = {
    ...existing,
    name: changes.name.trim(),
    customerId: customer.id,
    customerName: customer.name,
    projectReference: changes.projectReference?.trim() || undefined,
    updatedAt: todayIso(),
  };
  saveBudget(updated);
  return { ok: true, budget: updated };
}

export interface BudgetCompositionChanges {
  stages?: Budget["stages"];
  marginPercentage?: number;
  discountAmount?: number;
}

/** Stages, margin, and discount — the pricing composition of the
 * proposal. Blocked the same way as `updateBudgetDetails` once the
 * Budget is terminal; this is what makes an approved/rejected
 * proposal's value permanently stable (see module doc comment). */
export function updateBudgetComposition(existing: Budget, changes: BudgetCompositionChanges): BudgetResult {
  if (!isEditable(existing)) {
    return {
      ok: false,
      error: "Orçamentos aprovados ou recusados são somente leitura — a composição não pode ser alterada.",
    };
  }
  const updated: Budget = { ...existing, ...changes, updatedAt: todayIso() };
  saveBudget(updated);
  return { ok: true, budget: updated };
}

/** The only way out of `"draft"`. Requires `status === "draft"` exactly
 * — calling it on `pending_approval`/`approved`/`rejected` is a no-op
 * error, never a partial mutation. Changes status only; every other
 * field (token, customer, reference, stages, margin, discount,
 * createdAt) is untouched. */
export function submitBudgetForApproval(budget: Budget): BudgetResult {
  if (budget.status !== "draft") {
    return { ok: false, error: "Este orçamento já foi disponibilizado para aprovação." };
  }
  const updated: Budget = { ...budget, status: "pending_approval", updatedAt: todayIso() };
  saveBudget(updated);
  return { ok: true, budget: updated };
}

export function removeBudget(budget: Budget): DomainResult {
  if (!isEditable(budget)) {
    return {
      ok: false,
      error: "Orçamentos aprovados ou recusados não podem ser excluídos — o histórico é preservado.",
    };
  }
  // Defense-in-depth: an approved Obra always originates from a Budget
  // still "approved" at the time of creation, so this should only ever
  // trip against a future caller/status rework that forgets the check
  // above (mirrors the equivalent guard in purchase-order.ts).
  const hasProject = listAllProjects().some((project) => project.budgetId === budget.id);
  if (hasProject) {
    return { ok: false, error: "Este orçamento já tem uma obra vinculada e não pode ser excluído." };
  }
  deleteBudgetRecord(budget.id);
  return { ok: true };
}

export function approveBudgetProposal(budget: Budget): BudgetResult {
  if (budget.status !== "pending_approval") {
    return { ok: false, error: "Esta proposta não está mais aguardando decisão." };
  }
  const updated: Budget = { ...budget, status: "approved", updatedAt: todayIso() };
  saveBudget(updated);
  return { ok: true, budget: updated };
}

export function rejectBudgetProposal(budget: Budget): BudgetResult {
  if (budget.status !== "pending_approval") {
    return { ok: false, error: "Esta proposta não está mais aguardando decisão." };
  }
  const updated: Budget = { ...budget, status: "rejected", updatedAt: todayIso() };
  saveBudget(updated);
  return { ok: true, budget: updated };
}
