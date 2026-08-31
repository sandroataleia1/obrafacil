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
 * Origin: a Payable created manually has no `originType`/`originId`
 * — absence of origin represents a manual entry, no migration needed
 * for payables created before origin tracking existed. A Payable
 * produced by closing an EmployeeWorkPeriod (see `features/employees`)
 * carries `originType: "employee-period"` and `originId` pointing at
 * that period, so the integration can guarantee a period never
 * produces more than one Payable (see `findPayableByOrigin`). Such a
 * payable is a financial snapshot of the period's estimated pay —
 * its description/supplier/amount/category derive from the period and
 * are not directly editable here; only `dueDate`/`notes` are (see
 * `payable-form.tsx`).
 *
 * Workforce payables (`originType: "employee-period"`) are always
 * created with `projectId: undefined`. Employee work allocation across
 * projects is not modeled yet, so paying one never produces a
 * ProjectCost — creating a labor ProjectCost before project allocation
 * would incorrectly assign the employee's full period cost to a
 * single project. The existing "no project => no ProjectCost" rule
 * already covers this; no special-casing was needed.
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

export type PayableOriginType = "employee-period";

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
  originType?: PayableOriginType;
  originId?: string;
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
