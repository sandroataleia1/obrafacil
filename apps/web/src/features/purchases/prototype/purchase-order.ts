/**
 * Domain operations for PurchaseOrder/PurchaseOrderItem. Every
 * invariant lives here, not only in the form, mirroring
 * `receivable.ts`/`material.ts`.
 *
 * Status state machine (`commercialStatus`):
 *   draft      -> ordered   (validated: see `validateForOrdered`)
 *   draft      -> cancelled
 *   ordered    -> draft     (unrestricted in this v1 — no GoodsReceipt/
 *                            Payable exists yet to protect; Task 041/043
 *                            will likely restrict this once they do)
 *   ordered    -> cancelled
 *   cancelled  -> draft     (reactivation, unrestricted in this v1)
 * Any other transition (including cancelled -> ordered directly) is
 * rejected — to confirm a cancelled order, reactivate it to draft
 * first, then confirm normally.
 *
 * A `cancelled` PurchaseOrder is read-only: no field, item, or item
 * list may change while cancelled — every mutation below checks
 * `isCancelled` first. Reactivate to `draft` to edit.
 *
 * `ordered` is a PERMANENT invariant, not just a one-time gate at
 * confirmation: an `ordered` PurchaseOrder must always keep at least
 * one item, every item's quantity normalized > 0, and every item's
 * unitPrice > 0. This is enforced continuously by making every
 * mutation that could break it impossible while `ordered`:
 *   - `addPurchaseOrderItem` requires `unitPrice > 0` while ordered
 *     (draft still allows R$0,00 — the order hasn't been confirmed
 *     as final, so an incomplete price is expected there);
 *   - `updatePurchaseOrderItem` requires `unitPrice > 0` while ordered;
 *   - `removePurchaseOrderItem` refuses to remove the last remaining
 *     item while ordered (an order can never end up `ordered` with
 *     zero items — go back to `draft` first to remove everything).
 * Together these make a full re-validation on every mutation
 * unnecessary — no path can produce an invalid `ordered` state.
 *
 * `ordered` also locks the order's identity: `supplierId`,
 * `projectId`, and `orderDate` cannot change while ordered (only
 * `expectedDeliveryDate`/`notes`/items are still editable). This is a
 * closed semantic decision for PurchaseOrder itself, independent of
 * GoodsReceipt/Payable not existing yet.
 *
 * Deletion is only allowed for `draft` orders (with no other
 * downstream dependency yet); it cascades to that order's items only.
 *
 * Quantity precision: every stored `quantity` is normalized to at
 * most 3 decimal places via `toQuantityUnits`/1000 before persisting
 * — the same precision `MaterialRequirement` and the material-planning
 * aggregation already use. A value whose normalized quantity rounds to
 * zero (e.g. 0.0004) is rejected outright, never silently stored as a
 * "positive" value that is actually zero once normalized.
 */

import { toCents } from "@/lib/currency";
import { toQuantityUnits } from "@/lib/quantity";
import { todayIso } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import { getSupplier } from "@/features/suppliers/prototype/supplier-store";
import { getMaterial } from "@/features/materials/prototype/material-store";
import type { PurchaseOrder, PurchaseOrderCommercialStatus, PurchaseOrderItem } from "../types";
import {
  createPurchaseOrderId,
  deletePurchaseOrder as deletePurchaseOrderRecord,
  savePurchaseOrder,
} from "./purchase-order-store";
import {
  createPurchaseOrderItemId,
  deleteItemsByPurchaseOrder,
  deletePurchaseOrderItem as deletePurchaseOrderItemRecord,
  findItemByMaterial,
  listItemsByPurchaseOrder,
  savePurchaseOrderItem,
} from "./purchase-order-item-store";

export type PurchaseOrderResult =
  | { ok: true; purchaseOrder: PurchaseOrder }
  | { ok: false; error: string };
export type PurchaseOrderItemResult =
  | { ok: true; item: PurchaseOrderItem }
  | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

export interface PurchaseOrderHeaderInput {
  supplierId: string;
  projectId: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  notes?: string;
}

function isCancelled(purchaseOrder: PurchaseOrder): boolean {
  return purchaseOrder.commercialStatus === "cancelled";
}

function isOrdered(purchaseOrder: PurchaseOrder): boolean {
  return purchaseOrder.commercialStatus === "ordered";
}

/** Normalizes a quantity to at most 3 decimal places. */
function normalizeQuantity(value: number): number {
  return toQuantityUnits(value) / 1000;
}

function isValidQuantity(value: number): boolean {
  return toQuantityUnits(value) > 0;
}

export function createPurchaseOrder(input: PurchaseOrderHeaderInput): PurchaseOrderResult {
  const supplier = getSupplier(input.supplierId);
  if (!supplier) return { ok: false, error: "Fornecedor não encontrado." };
  if (supplier.status !== "active") {
    return { ok: false, error: "Selecione um fornecedor ativo." };
  }
  if (!getProject(input.projectId)) {
    return { ok: false, error: "Obra não encontrada." };
  }
  if (input.orderDate.trim() === "") {
    return { ok: false, error: "Informe a data do pedido." };
  }

  const now = todayIso();
  const purchaseOrder: PurchaseOrder = {
    id: createPurchaseOrderId(),
    supplierId: input.supplierId,
    projectId: input.projectId,
    orderDate: input.orderDate,
    expectedDeliveryDate: input.expectedDeliveryDate || undefined,
    commercialStatus: "draft",
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  savePurchaseOrder(purchaseOrder);
  return { ok: true, purchaseOrder };
}

export function updatePurchaseOrder(
  existing: PurchaseOrder,
  changes: PurchaseOrderHeaderInput
): PurchaseOrderResult {
  if (isCancelled(existing)) {
    return {
      ok: false,
      error: "Pedido cancelado é somente leitura. Reative para rascunho para editar.",
    };
  }

  if (isOrdered(existing)) {
    // Identity fields are locked once the order is confirmed — only
    // expectedDeliveryDate/notes (and items, via the item functions
    // below) remain editable.
    if (changes.supplierId !== existing.supplierId) {
      return { ok: false, error: "Não é possível alterar o fornecedor de um pedido já realizado." };
    }
    if (changes.projectId !== existing.projectId) {
      return { ok: false, error: "Não é possível alterar a obra de um pedido já realizado." };
    }
    if (changes.orderDate !== existing.orderDate) {
      return {
        ok: false,
        error: "Não é possível alterar a data do pedido de um pedido já realizado.",
      };
    }
  } else if (changes.supplierId !== existing.supplierId) {
    const supplier = getSupplier(changes.supplierId);
    if (!supplier) return { ok: false, error: "Fornecedor não encontrado." };
    if (supplier.status !== "active") {
      return { ok: false, error: "Selecione um fornecedor ativo." };
    }
  }

  if (changes.projectId !== existing.projectId && !getProject(changes.projectId)) {
    return { ok: false, error: "Obra não encontrada." };
  }
  if (changes.orderDate.trim() === "") {
    return { ok: false, error: "Informe a data do pedido." };
  }

  const updated: PurchaseOrder = {
    ...existing,
    supplierId: changes.supplierId,
    projectId: changes.projectId,
    orderDate: changes.orderDate,
    expectedDeliveryDate: changes.expectedDeliveryDate || undefined,
    notes: changes.notes?.trim() || undefined,
    updatedAt: todayIso(),
  };
  savePurchaseOrder(updated);
  return { ok: true, purchaseOrder: updated };
}

export function removePurchaseOrder(purchaseOrder: PurchaseOrder): DomainResult {
  if (purchaseOrder.commercialStatus !== "draft") {
    return {
      ok: false,
      error: "Somente pedidos em rascunho podem ser excluídos. Cancele o pedido para preservá-lo no histórico.",
    };
  }
  deleteItemsByPurchaseOrder(purchaseOrder.id);
  deletePurchaseOrderRecord(purchaseOrder.id);
  return { ok: true };
}

export interface PurchaseOrderItemInput {
  materialId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export function addPurchaseOrderItem(
  purchaseOrder: PurchaseOrder,
  input: PurchaseOrderItemInput
): PurchaseOrderItemResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }

  const material = getMaterial(input.materialId);
  if (!material) return { ok: false, error: "Material não encontrado." };
  if (material.status !== "active") {
    return { ok: false, error: "Selecione um material ativo." };
  }
  if (findItemByMaterial(purchaseOrder.id, input.materialId)) {
    return {
      ok: false,
      error: "Este material já foi adicionado a este pedido. Edite a linha existente.",
    };
  }
  if (input.description.trim() === "") {
    return { ok: false, error: "Informe uma descrição." };
  }
  if (!isValidQuantity(input.quantity)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }
  const priceCents = toCents(input.unitPrice);
  if (priceCents < 0) {
    return { ok: false, error: "Informe um preço unitário válido." };
  }
  if (isOrdered(purchaseOrder) && priceCents <= 0) {
    return {
      ok: false,
      error: "Informe um preço unitário maior que zero: este pedido já foi confirmado.",
    };
  }

  const now = todayIso();
  const item: PurchaseOrderItem = {
    id: createPurchaseOrderItemId(),
    purchaseOrderId: purchaseOrder.id,
    materialId: input.materialId,
    description: input.description.trim(),
    unit: { ...material.defaultUnit },
    quantity: normalizeQuantity(input.quantity),
    unitPrice: input.unitPrice,
    createdAt: now,
    updatedAt: now,
  };
  savePurchaseOrderItem(item);
  return { ok: true, item };
}

export interface PurchaseOrderItemChanges {
  description: string;
  quantity: number;
  unitPrice: number;
}

export function updatePurchaseOrderItem(
  purchaseOrder: PurchaseOrder,
  existing: PurchaseOrderItem,
  changes: PurchaseOrderItemChanges
): PurchaseOrderItemResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }
  if (changes.description.trim() === "") {
    return { ok: false, error: "Informe uma descrição." };
  }
  if (!isValidQuantity(changes.quantity)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }
  const priceCents = toCents(changes.unitPrice);
  if (priceCents < 0) {
    return { ok: false, error: "Informe um preço unitário válido." };
  }
  if (isOrdered(purchaseOrder) && priceCents <= 0) {
    return {
      ok: false,
      error: "Informe um preço unitário maior que zero: este pedido já foi confirmado.",
    };
  }

  const updated: PurchaseOrderItem = {
    ...existing,
    description: changes.description.trim(),
    quantity: normalizeQuantity(changes.quantity),
    unitPrice: changes.unitPrice,
    updatedAt: todayIso(),
  };
  savePurchaseOrderItem(updated);
  return { ok: true, item: updated };
}

export function removePurchaseOrderItem(
  purchaseOrder: PurchaseOrder,
  item: PurchaseOrderItem
): DomainResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }
  if (isOrdered(purchaseOrder) && listItemsByPurchaseOrder(purchaseOrder.id).length <= 1) {
    return {
      ok: false,
      error: "Um pedido já realizado precisa manter ao menos um item. Volte para rascunho para remover todos.",
    };
  }
  deletePurchaseOrderItemRecord(item.id);
  return { ok: true };
}

function validateForOrdered(purchaseOrder: PurchaseOrder, items: PurchaseOrderItem[]): string | null {
  if (!getSupplier(purchaseOrder.supplierId)) return "Fornecedor não encontrado.";
  if (!getProject(purchaseOrder.projectId)) return "Obra não encontrada.";
  if (items.length === 0) return "Adicione ao menos um item antes de confirmar o pedido.";
  if (items.some((item) => !isValidQuantity(item.quantity))) {
    return "Todos os itens precisam de quantidade maior que zero.";
  }
  if (items.some((item) => toCents(item.unitPrice) <= 0)) {
    return "Todos os itens precisam de preço unitário maior que zero antes de confirmar o pedido.";
  }
  return null;
}

const ALLOWED_TRANSITIONS: Record<PurchaseOrderCommercialStatus, PurchaseOrderCommercialStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["draft", "cancelled"],
  cancelled: ["draft"],
};

export function changePurchaseOrderStatus(
  purchaseOrder: PurchaseOrder,
  newStatus: PurchaseOrderCommercialStatus,
  items: PurchaseOrderItem[]
): PurchaseOrderResult {
  if (!ALLOWED_TRANSITIONS[purchaseOrder.commercialStatus].includes(newStatus)) {
    return { ok: false, error: "Essa mudança de status não é permitida." };
  }

  if (newStatus === "ordered") {
    const error = validateForOrdered(purchaseOrder, items);
    if (error) return { ok: false, error };
  }

  const updated: PurchaseOrder = {
    ...purchaseOrder,
    commercialStatus: newStatus,
    updatedAt: todayIso(),
  };
  savePurchaseOrder(updated);
  return { ok: true, purchaseOrder: updated };
}
