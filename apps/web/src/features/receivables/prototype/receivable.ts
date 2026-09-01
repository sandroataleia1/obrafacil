/**
 * Domain operations for Receivable/Receipt. Stores only persist; every
 * invariant lives here so it is enforced regardless of which screen
 * calls it, not only when the form's Select happens to prevent a bad
 * combination from being picked in the first place.
 *
 * Rules enforced here (see Task 036 spec):
 * - `customerId` is required; when `projectId` is set, the Project's
 *   own `customerId` must match — a Receivable can never claim a
 *   different customer than the Obra it is billing.
 * - Once a Receivable has at least one Receipt, `customerId`,
 *   `projectId` and `amount` are locked — those fields would change
 *   the identity or financial basis of a fact already partially
 *   settled. Only `description`, `dueDate` and `notes` stay editable.
 * - A Receivable with any Receipt cannot be deleted — the Receipts
 *   must be removed first (mirrors the Payable/ProjectCost dependency
 *   guard already used elsewhere in this codebase).
 * - A new Receipt can never push `SUM(receipts) > receivable.amount`
 *   (overpayment), checked in integer cents.
 * - Deleting a Receipt is unrestricted (no reversal flag to maintain);
 *   the Receivable itself is never touched by it.
 */

import { formatCurrency, toCents } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import { calculateReceivableFinancials } from "../receivable-status";
import type { Receipt, Receivable } from "../types";
import {
  createReceivableId,
  deleteReceivable as deleteReceivableRecord,
  saveReceivable,
} from "./receivable-store";
import {
  createReceiptId,
  deleteReceipt as deleteReceiptRecord,
  listReceiptsByReceivable,
  saveReceipt,
} from "./receipt-store";

export type ReceivableResult = { ok: true; receivable: Receivable } | { ok: false; error: string };
export type ReceiptResult = { ok: true; receipt: Receipt } | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

export interface ReceivableInput {
  description: string;
  customerId: string;
  projectId?: string;
  amount: number;
  dueDate: string;
  notes?: string;
}

function validateCustomerProject(customerId: string, projectId: string | undefined): string | null {
  if (!projectId) return null;
  const project = getProject(projectId);
  if (!project) return "Obra não encontrada.";
  if (project.customerId !== customerId) {
    return "A obra selecionada pertence a outro cliente.";
  }
  return null;
}

export function createReceivable(input: ReceivableInput): ReceivableResult {
  if (input.description.trim() === "") return { ok: false, error: "Informe uma descrição." };
  if (input.customerId.trim() === "") return { ok: false, error: "Selecione um cliente." };
  if (!(input.amount > 0)) return { ok: false, error: "Informe um valor maior que zero." };
  if (input.dueDate.trim() === "") return { ok: false, error: "Informe o vencimento." };

  const invariantError = validateCustomerProject(input.customerId, input.projectId);
  if (invariantError) return { ok: false, error: invariantError };

  const now = todayIso();
  const receivable: Receivable = {
    id: createReceivableId(),
    description: input.description.trim(),
    customerId: input.customerId,
    projectId: input.projectId,
    amount: input.amount,
    dueDate: input.dueDate,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveReceivable(receivable);
  return { ok: true, receivable };
}

export function updateReceivable(existing: Receivable, changes: ReceivableInput): ReceivableResult {
  if (changes.description.trim() === "") return { ok: false, error: "Informe uma descrição." };
  if (changes.dueDate.trim() === "") return { ok: false, error: "Informe o vencimento." };

  const hasReceipts = listReceiptsByReceivable(existing.id).length > 0;

  if (hasReceipts) {
    if (changes.customerId !== existing.customerId || changes.projectId !== existing.projectId) {
      return {
        ok: false,
        error: "Cliente e obra não podem ser alterados após um recebimento registrado.",
      };
    }
    if (toCents(changes.amount) !== toCents(existing.amount)) {
      return {
        ok: false,
        error: "O valor não pode ser alterado após um recebimento registrado.",
      };
    }
  } else {
    if (changes.customerId.trim() === "") return { ok: false, error: "Selecione um cliente." };
    if (!(changes.amount > 0)) return { ok: false, error: "Informe um valor maior que zero." };
    const invariantError = validateCustomerProject(changes.customerId, changes.projectId);
    if (invariantError) return { ok: false, error: invariantError };
  }

  const updated: Receivable = {
    ...existing,
    description: changes.description.trim(),
    customerId: hasReceipts ? existing.customerId : changes.customerId,
    projectId: hasReceipts ? existing.projectId : changes.projectId,
    amount: hasReceipts ? existing.amount : changes.amount,
    dueDate: changes.dueDate,
    notes: changes.notes?.trim() || undefined,
    updatedAt: todayIso(),
  };
  saveReceivable(updated);
  return { ok: true, receivable: updated };
}

export function removeReceivable(receivable: Receivable): DomainResult {
  const receipts = listReceiptsByReceivable(receivable.id);
  if (receipts.length > 0) {
    return {
      ok: false,
      error:
        "Esta conta possui recebimentos registrados. Remova os recebimentos antes de excluir a conta.",
    };
  }
  deleteReceivableRecord(receivable.id);
  return { ok: true };
}

export function registerReceipt(
  receivable: Receivable,
  amount: number,
  receivedAt: string,
  notes?: string
): ReceiptResult {
  if (!(amount > 0)) return { ok: false, error: "Informe um valor maior que zero." };
  if (receivedAt.trim() === "") return { ok: false, error: "Informe a data do recebimento." };

  const receipts = listReceiptsByReceivable(receivable.id);
  const { outstandingAmount } = calculateReceivableFinancials(receivable, receipts);
  const amountCents = toCents(amount);
  const outstandingCents = toCents(outstandingAmount);

  if (amountCents > outstandingCents) {
    return {
      ok: false,
      error: `Valor maior que o saldo em aberto de ${formatCurrency(outstandingAmount)}.`,
    };
  }

  const now = todayIso();
  const receipt: Receipt = {
    id: createReceiptId(),
    receivableId: receivable.id,
    amount,
    receivedAt,
    notes: notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveReceipt(receipt);
  return { ok: true, receipt };
}

export function removeReceipt(receiptId: string): void {
  deleteReceiptRecord(receiptId);
}
