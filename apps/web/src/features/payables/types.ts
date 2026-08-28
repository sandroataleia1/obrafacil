/**
 * UI/prototype model for accounts payable (contas a pagar).
 *
 * A Payable represents a bill that must be paid — pending or overdue
 * until `paidAt` is set. It intentionally has no installment,
 * recurrence, bank account, boleto/Pix, payment method, fiscal
 * document, attachment, interest, discount, or partial-payment
 * concept; those belong to a later, more complete Contas a Pagar
 * version.
 *
 * Status is derived, never stored: `paidAt` set => "paid"; otherwise
 * `dueDate` in the past => "overdue"; otherwise "pending". See
 * `payable-status.ts`.
 *
 * A pending/overdue Payable never generates a ProjectCost — cadastro
 * alone is not a realized cost. Only marking it as paid, and only
 * when linked to a Project, produces a ProjectCost (see
 * `features/project-costs`) tagged with `originType: "payable"` so
 * the realized cost is never duplicated. A Payable with no Project
 * represents a general/administrative expense and never produces a
 * ProjectCost even when paid.
 *
 * Due dates will later support reminder/notification workflows. No
 * notifications are sent in this prototype.
 *
 * This stays `Payable`, not a generic `FinancialEntry` — Contas a
 * Receber and other financial entities will get their own types when
 * they exist.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

import type { ProjectCostCategory } from "@/features/project-costs/types";

export type PayableStatus = "pending" | "overdue" | "paid";

export interface Payable {
  id: string;
  description: string;
  supplier?: string;
  amount: number;
  dueDate: string;
  category: ProjectCostCategory;
  projectId?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  pending: "Pendente",
  overdue: "Vencida",
  paid: "Paga",
};

export const PAYABLE_STATUS_FILTERS = ["all", "open", "overdue", "paid"] as const;
export type PayableStatusFilter = (typeof PAYABLE_STATUS_FILTERS)[number];

export const PAYABLE_STATUS_FILTER_LABEL: Record<PayableStatusFilter, string> = {
  all: "Todas",
  open: "Em aberto",
  overdue: "Vencidas",
  paid: "Pagas",
};
