/**
 * UI/prototype models for Contas a Receber (accounts receivable).
 *
 * Two separate entities, deliberately kept apart:
 *
 * - `Receivable` represents what a Customer owes — a right to receive,
 *   never an entry of cash. It has no `receivedAt`/`status` field:
 *   whether (and how much) it has been received is always derived
 *   from its `Receipt`s, never stored on the Receivable itself.
 * - `Receipt` represents an actual cash entry against one Receivable.
 *   A Receivable can have zero, one, or many Receipts — this is what
 *   makes partial/installment receiving possible without mutating the
 *   Receivable's own `amount`.
 *
 * Commercial installments ("Entrada", "Parcela 2", "Parcela 3") are
 * modeled as multiple separate `Receivable`s, NOT as multiple Receipts
 * against one Receivable — a Receipt only represents a partial/split
 * payment actually made against a single existing charge.
 *
 * Neither entity touches ProjectCost, Payable, Budget, or
 * EmployeePeriodAllocation. A Receivable/Receipt is a completely
 * separate financial dimension (money owed / money received) from
 * cost (economic dimension) or Payable (money owed BY the company).
 * See `features/projects/prototype/project-summary.ts` for the
 * equivalent isolation already enforced on the cost/payable side.
 *
 * `customerId` is required — a Receivable only exists because someone
 * owes money, unlike a Payable (always "owed by the company").
 * `projectId` is optional, same as `Payable.projectId`: a Receivable
 * can be a general charge to a Customer with no Obra attached.
 *
 * No `category` field: "sinal"/"parcela"/"medição"/"aditivo" belong in
 * `description`, not a taxonomy invented without a real use case yet
 * (unlike `Payable.category`, which already feeds `costsByCategory`).
 *
 * No `originType`/`originId` in this v1 — Budget does not generate
 * Receivables automatically, so there is no origin to track yet. Add
 * it as an optional field, without migration, once that flow exists.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export interface Receivable {
  id: string;
  description: string;

  customerId: string;
  projectId?: string;

  amount: number;
  dueDate: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * `receivableId` is the only link back to its Receivable — customer,
 * project, description and due date all derive from there, so they
 * are never duplicated onto the Receipt.
 */
export interface Receipt {
  id: string;
  receivableId: string;

  amount: number;
  receivedAt: string;

  notes?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Display-only status, derived at read time from `Receivable.amount`
 * vs. its Receipts and `dueDate` vs. today — never persisted. Priority
 * order (highest first) when more than one condition applies:
 * received > overdue > partial > pending. This lets a Receivable be
 * "parcial + vencida" at once without needing two separate enums.
 */
export type ReceivableDisplayStatus = "pending" | "partial" | "overdue" | "received";

export const RECEIVABLE_DISPLAY_STATUS_LABEL: Record<ReceivableDisplayStatus, string> = {
  pending: "Pendente",
  partial: "Parcial",
  overdue: "Vencida",
  received: "Recebida",
};

/**
 * Filter set intentionally excludes "partial" — a 5th tab was too
 * cramped at 375px (see Task 036 spec item 23). A partially received,
 * non-overdue Receivable still shows correctly under "Todas" and in
 * its own detail screen; it's just not a dedicated top-level filter.
 */
export const RECEIVABLE_STATUS_FILTERS = ["all", "pending", "overdue", "received"] as const;
export type ReceivableStatusFilter = (typeof RECEIVABLE_STATUS_FILTERS)[number];

export const RECEIVABLE_STATUS_FILTER_LABEL: Record<ReceivableStatusFilter, string> = {
  all: "Todas",
  pending: "Pendentes",
  overdue: "Vencidas",
  received: "Recebidas",
};
