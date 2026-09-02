/**
 * Domain operations for PurchaseOrder/PurchaseOrderItem. Every
 * invariant lives here, not only in the form, mirroring
 * `receivable.ts`/`material.ts`.
 *
 * Status state machine (`commercialStatus`):
 *   draft      -> ordered   (validated: see `validateForOrdered`)
 *   draft      -> cancelled
 *   ordered    -> draft     (BLOCKED if the order has any GoodsReceipt
 *                            — a physical fact already exists; remove
 *                            the GoodsReceipts first, see Task 041)
 *   ordered    -> cancelled (BLOCKED if fulfillment is already fully
 *                            "received" — nothing remains to cancel)
 *   cancelled  -> draft     (BLOCKED if the order has any GoodsReceipt,
 *                            same reasoning as ordered -> draft)
 * Any other transition (including cancelled -> ordered directly) is
 * rejected — to confirm a cancelled order, reactivate it to draft
 * first, then confirm normally. `hasGoodsReceipts` is passed in by the
 * caller (derived from GoodsReceiptItem history — see
 * `goods-receipt.ts`) rather than looked up here, keeping this module
 * decoupled from the GoodsReceipt stores' internals.
 *
 * A `cancelled` PurchaseOrder is read-only for its own fields/items —
 * no field, item, or item list may change while cancelled — every
 * mutation below checks `isCancelled` first. Reactivate to `draft` to
 * edit (blocked while GoodsReceipts exist, see above). A cancelled
 * order CAN still hold GoodsReceipt history from before cancellation
 * (partial delivery, rest cancelled) — that history is never touched
 * by cancellation itself.
 *
 * `ordered` is a PERMANENT invariant, not just a one-time gate at
 * confirmation: an `ordered` PurchaseOrder must always keep at least
 * one item, every item's quantity normalized > 0, and every item's
 * unitPrice > 0. This is enforced continuously:
 *   - `addPurchaseOrderItem` requires `unitPrice > 0` while ordered,
 *     and is blocked entirely once the order's fulfillment is fully
 *     "received" (`isFullyReceived`) — adding scope to an order that
 *     was already completely fulfilled would retroactively change
 *     what "fully received" meant;
 *   - `updatePurchaseOrderItem` requires `unitPrice > 0` while ordered;
 *     quantity can never drop below what was already physically
 *     received (`receivedQuantity`, supplied by the caller), and is
 *     fully frozen once the item itself is fully received (neither
 *     increase nor decrease);
 *   - `removePurchaseOrderItem` refuses to remove an item with any
 *     `receivedQuantity`, and refuses to remove the last remaining
 *     item while ordered.
 *
 * `ordered` also locks the order's identity: `supplierId`,
 * `projectId`, and `orderDate` cannot change while ordered (only
 * `expectedDeliveryDate`/`notes`/items are still editable).
 *
 * Deletion is only allowed for `draft` orders; it cascades to that
 * order's items only (a `draft` order can never have a GoodsReceipt,
 * since `registerGoodsReceipt` only accepts `ordered` orders).
 */

import { toCents } from "@/lib/currency";
import { isPositiveQuantity, normalizeQuantity, toQuantityUnits } from "@/lib/quantity";
import { todayIso } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import { getSupplier } from "@/features/suppliers/prototype/supplier-store";
import { getMaterial } from "@/features/materials/prototype/material-store";
import type { GoodsReceiptItem, PurchaseOrder, PurchaseOrderCommercialStatus, PurchaseOrderItem } from "../types";
import { calculatePurchaseOrderFulfillment } from "./fulfillment";
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
    // below) remain editable. This also transitively protects any
    // GoodsReceipt history, since a GoodsReceipt only ever exists
    // while the order is (or was) ordered.
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
  input: PurchaseOrderItemInput,
  isFullyReceived: boolean = false
): PurchaseOrderItemResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }
  if (isFullyReceived) {
    return {
      ok: false,
      error: "Este pedido já foi totalmente recebido e não aceita novos itens.",
    };
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
  if (!isPositiveQuantity(input.quantity)) {
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
  changes: PurchaseOrderItemChanges,
  receivedQuantity: number = 0
): PurchaseOrderItemResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }
  if (changes.description.trim() === "") {
    return { ok: false, error: "Informe uma descrição." };
  }
  if (!isPositiveQuantity(changes.quantity)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }

  const receivedUnits = toQuantityUnits(receivedQuantity);
  const existingUnits = toQuantityUnits(existing.quantity);
  const newUnits = toQuantityUnits(changes.quantity);
  const itemFullyReceived = receivedUnits > 0 && receivedUnits >= existingUnits;

  if (itemFullyReceived && newUnits !== existingUnits) {
    return {
      ok: false,
      error: "Este item já foi totalmente recebido e sua quantidade não pode ser alterada.",
    };
  }
  if (!itemFullyReceived && newUnits < receivedUnits) {
    return {
      ok: false,
      error: "A quantidade não pode ficar abaixo do que já foi recebido.",
    };
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
  item: PurchaseOrderItem,
  receivedQuantity: number = 0
): DomainResult {
  if (isCancelled(purchaseOrder)) {
    return { ok: false, error: "Pedido cancelado é somente leitura." };
  }
  if (toQuantityUnits(receivedQuantity) > 0) {
    return { ok: false, error: "Este item já possui material recebido." };
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
  if (items.some((item) => !isPositiveQuantity(item.quantity))) {
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
  items: PurchaseOrderItem[],
  receiptItems: GoodsReceiptItem[]
): PurchaseOrderResult {
  if (!ALLOWED_TRANSITIONS[purchaseOrder.commercialStatus].includes(newStatus)) {
    return { ok: false, error: "Essa mudança de status não é permitida." };
  }

  const hasGoodsReceipts = receiptItems.length > 0;

  if (newStatus === "draft" && hasGoodsReceipts) {
    return {
      ok: false,
      error:
        "Este pedido possui recebimentos registrados e não pode voltar para rascunho. Remova os recebimentos primeiro.",
    };
  }

  if (newStatus === "cancelled") {
    const fulfillment = calculatePurchaseOrderFulfillment(items, receiptItems);
    if (fulfillment === "received") {
      return { ok: false, error: "Este pedido já foi totalmente recebido." };
    }
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
