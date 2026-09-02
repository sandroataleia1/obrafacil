/**
 * Domain operations for GoodsReceipt/GoodsReceiptItem. Every
 * invariant lives here, mirroring `purchase-order.ts`.
 *
 * `registerGoodsReceipt` is atomic: every line is validated first
 * (order/item linkage, positive normalized quantity, no duplicate
 * PurchaseOrderItem within the same receipt, no over-receipt against
 * the item's own remaining balance) — only after every line passes
 * does it persist the GoodsReceipt and its GoodsReceiptItems. A single
 * invalid line rejects the whole call; nothing is ever partially
 * written.
 *
 * Deliberately isolated from money: this module never imports
 * `savePayable`/`markPayableAsPaid`/`saveProjectCost`/anything from
 * `features/payables`, `features/receivables`, or
 * `features/project-costs`. Registering or removing a GoodsReceipt
 * changes only physical-arrival history — never a Payable, a
 * ProjectCost, or any cash figure (see Task 038 discovery).
 */

import { todayIso } from "@/lib/date";
import { formatQuantity, isPositiveQuantity, normalizeQuantity, toQuantityUnits } from "@/lib/quantity";
import { formatMaterialUnit } from "@/features/materials/material-unit";
import type { GoodsReceipt, GoodsReceiptItem, PurchaseOrder } from "../types";
import { calculateItemFulfillment } from "./fulfillment";
import { listItemsByPurchaseOrder } from "./purchase-order-item-store";
import {
  createGoodsReceiptId,
  deleteGoodsReceipt as deleteGoodsReceiptRecord,
  saveGoodsReceipt,
} from "./goods-receipt-store";
import {
  createGoodsReceiptItemId,
  deleteItemsByGoodsReceipt,
  listReceiptItemsByPurchaseOrder,
  saveGoodsReceiptItem,
} from "./goods-receipt-item-store";

export type GoodsReceiptResult =
  | { ok: true; goodsReceipt: GoodsReceipt }
  | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

export interface GoodsReceiptLineInput {
  purchaseOrderItemId: string;
  quantity: number;
}

export interface GoodsReceiptInput {
  receivedAt: string;
  notes?: string;
  items: GoodsReceiptLineInput[];
}

export function registerGoodsReceipt(
  purchaseOrder: PurchaseOrder,
  input: GoodsReceiptInput
): GoodsReceiptResult {
  if (purchaseOrder.commercialStatus !== "ordered") {
    return { ok: false, error: "Somente pedidos confirmados podem receber materiais." };
  }
  if (input.receivedAt.trim() === "") {
    return { ok: false, error: "Informe a data do recebimento." };
  }

  // Only lines with a meaningful (positive) quantity count — a blank
  // field for an item that didn't arrive in this delivery is simply
  // ignored, not an error.
  const lines = input.items.filter((line) => isPositiveQuantity(line.quantity));
  if (lines.length === 0) {
    return { ok: false, error: "Informe a quantidade recebida de ao menos um item." };
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.purchaseOrderItemId)) {
      return { ok: false, error: "Cada item só pode aparecer uma vez neste recebimento." };
    }
    seen.add(line.purchaseOrderItemId);
  }

  const orderItems = listItemsByPurchaseOrder(purchaseOrder.id);
  const orderItemById = new Map(orderItems.map((item) => [item.id, item]));
  const existingReceiptItems = listReceiptItemsByPurchaseOrder(purchaseOrder.id);

  for (const line of lines) {
    const orderItem = orderItemById.get(line.purchaseOrderItemId);
    if (!orderItem) {
      return { ok: false, error: "Um dos itens não pertence a este pedido." };
    }

    const fulfillment = calculateItemFulfillment(orderItem, existingReceiptItems);
    const lineUnits = toQuantityUnits(line.quantity);
    const remainingUnits = toQuantityUnits(fulfillment.remainingQuantity);
    if (lineUnits > remainingUnits) {
      return {
        ok: false,
        error: `Quantidade maior que o saldo pendente de ${formatQuantity(fulfillment.remainingQuantity)} ${formatMaterialUnit(orderItem.unit)} para ${orderItem.description}.`,
      };
    }
  }

  // Every line validated — persist atomically now.
  const now = todayIso();
  const goodsReceipt: GoodsReceipt = {
    id: createGoodsReceiptId(),
    purchaseOrderId: purchaseOrder.id,
    receivedAt: input.receivedAt,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveGoodsReceipt(goodsReceipt);

  for (const line of lines) {
    const item: GoodsReceiptItem = {
      id: createGoodsReceiptItemId(),
      goodsReceiptId: goodsReceipt.id,
      purchaseOrderItemId: line.purchaseOrderItemId,
      quantity: normalizeQuantity(line.quantity),
    };
    saveGoodsReceiptItem(item);
  }

  return { ok: true, goodsReceipt };
}

export function removeGoodsReceipt(goodsReceipt: GoodsReceipt): DomainResult {
  deleteItemsByGoodsReceipt(goodsReceipt.id);
  deleteGoodsReceiptRecord(goodsReceipt.id);
  return { ok: true };
}
