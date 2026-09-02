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
import { getMaterial } from "@/features/materials/prototype/material-store";
import {
  isTimelineValid,
  listConsumedEventsForProjectMaterial,
  listReceivedEventsForProjectMaterial,
} from "@/features/materials/prototype/material-consumption";
import type { GoodsReceipt, GoodsReceiptItem, PurchaseOrder } from "../types";
import { calculateItemFulfillment } from "./fulfillment";
import { getPurchaseOrder } from "./purchase-order-store";
import { listItemsByPurchaseOrder } from "./purchase-order-item-store";
import {
  createGoodsReceiptId,
  deleteGoodsReceipt as deleteGoodsReceiptRecord,
  saveGoodsReceipt,
} from "./goods-receipt-store";
import {
  createGoodsReceiptItemId,
  deleteItemsByGoodsReceipt,
  listItemsByGoodsReceipt,
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
  const purchaseOrder = getPurchaseOrder(goodsReceipt.purchaseOrderId);
  if (!purchaseOrder) {
    return { ok: false, error: "Pedido de compra não encontrado." };
  }

  const removedItems = listItemsByGoodsReceipt(goodsReceipt.id);
  const orderItemById = new Map(
    listItemsByPurchaseOrder(purchaseOrder.id).map((item) => [item.id, item])
  );

  // Every Material touched by this GoodsReceipt (e.g. cimento + areia in
  // one delivery) must keep a valid *chronology* after the removal, not
  // just a valid final total — a delivery removed from the middle of the
  // timeline can leave a later date's cumulative balance negative even
  // when today's grand total still looks fine (see
  // features/materials/prototype/material-consumption.ts's module doc
  // comment for the worked example). Every Material must stay valid or
  // none of them are removed — atomicity.
  const affectedMaterialIds = new Set<string>();
  for (const receiptItem of removedItems) {
    const orderItem = orderItemById.get(receiptItem.purchaseOrderItemId);
    if (orderItem) affectedMaterialIds.add(orderItem.materialId);
  }

  for (const materialId of affectedMaterialIds) {
    const receivedEvents = listReceivedEventsForProjectMaterial(
      purchaseOrder.projectId,
      materialId
    ).filter((event) => event.goodsReceiptId !== goodsReceipt.id);
    const consumedEvents = listConsumedEventsForProjectMaterial(purchaseOrder.projectId, materialId);

    // ConsumedEvent.units is a positive magnitude — negate it into a
    // signed ledger entry before validating (see material-consumption.ts).
    const signedConsumedEvents = consumedEvents.map((event) => ({ date: event.date, units: -event.units }));
    if (!isTimelineValid([...receivedEvents, ...signedConsumedEvents])) {
      const material = getMaterial(materialId);
      return {
        ok: false,
        error: material
          ? `Este recebimento não pode ser excluído porque parte de "${material.name}" já foi utilizada na obra.`
          : "Este recebimento não pode ser excluído porque parte do material já foi utilizada na obra.",
      };
    }
  }

  deleteItemsByGoodsReceipt(goodsReceipt.id);
  deleteGoodsReceiptRecord(goodsReceipt.id);
  return { ok: true };
}
