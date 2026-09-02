/**
 * Bridges a PurchaseOrder to Contas a Pagar. Generating a Payable is a
 * separate, explicit financial action — creating/confirming a
 * PurchaseOrder, registering a GoodsReceipt, or registering a
 * MaterialConsumption never creates a Payable on its own (see Task
 * 038/041/042A discoveries, extended here to the financial layer: the
 * physical/commercial cycle and the financial obligation are always
 * two separate facts).
 *
 * Unlike `features/employees/prototype/period-payable.ts`
 * (EmployeeWorkPeriod → at most one Payable, enforced via
 * `findPayableByOrigin`), a single PurchaseOrder can generate MANY
 * Payables — down payment, balance, additional installments — so this
 * module never checks for an "existing" Payable before creating one,
 * and `findPayableByOrigin` must never be used for `"purchase-order"`
 * (see `listPayablesByOrigin`).
 *
 * Every Payable generated here is fixed to the PurchaseOrder's own
 * facts (`originType`, `originId`, `projectId`, `supplier` snapshot,
 * `category: "materials"`) — the caller only ever supplies
 * amount/dueDate/description/notes. Draft orders are blocked (not yet
 * a real commitment); `ordered` and `cancelled` are both allowed (a
 * down payment can predate any GoodsReceipt, and a cancellation does
 * not erase a financial obligation already incurred — see
 * `purchase-order.ts`'s module doc comment).
 *
 * `SUM(Payables) <= PurchaseOrder.total` is deliberately NOT enforced
 * here — the real obligation can diverge from the pedido (freight,
 * adjustments, discounts) and there is no SupplierInvoice yet to
 * represent that formally. The divergence is surfaced, never hidden,
 * by `purchase-financial-summary.ts`'s `uncoveredAmount`/
 * `overGeneratedAmount`.
 *
 * This module never creates a ProjectCost — that only happens when
 * the generated Payable is later paid, through the existing
 * `markPayableAsPaid` flow (see `features/payables/prototype/payable-payment.ts`),
 * unchanged by this integration.
 */

import { toCents } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { createPayableId, savePayable } from "@/features/payables/prototype/payable-store";
import type { Payable } from "@/features/payables/types";
import type { Supplier } from "@/features/suppliers/types";
import type { PurchaseOrder } from "../types";

export type GeneratePayableResult = { ok: true; payable: Payable } | { ok: false; error: string };

export interface GeneratePayableFromPurchaseOrderInput {
  amount: number;
  dueDate: string;
  description?: string;
  notes?: string;
}

export function generatePayableFromPurchaseOrder(
  purchaseOrder: PurchaseOrder,
  supplier: Supplier | null,
  input: GeneratePayableFromPurchaseOrderInput
): GeneratePayableResult {
  if (purchaseOrder.commercialStatus === "draft") {
    return {
      ok: false,
      error: "Pedidos em rascunho ainda não geram conta a pagar. Confirme o pedido primeiro.",
    };
  }
  if (!supplier) {
    return { ok: false, error: "Fornecedor não encontrado." };
  }
  if (input.dueDate.trim() === "") {
    return { ok: false, error: "Informe o vencimento." };
  }
  if (!(toCents(input.amount) > 0)) {
    return { ok: false, error: "Informe um valor maior que zero." };
  }

  const now = todayIso();
  const payable: Payable = {
    id: createPayableId(),
    description: input.description?.trim() || `Compra · ${supplier.name}`,
    supplier: supplier.name,
    amount: input.amount,
    category: "materials",
    dueDate: input.dueDate,
    projectId: purchaseOrder.projectId,
    notes: input.notes?.trim() || undefined,
    originType: "purchase-order",
    originId: purchaseOrder.id,
    createdAt: now,
    updatedAt: now,
  };

  savePayable(payable);
  return { ok: true, payable };
}
