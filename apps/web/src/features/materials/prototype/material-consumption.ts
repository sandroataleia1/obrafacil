/**
 * Domain operations for MaterialConsumption — the physical "used at
 * this Obra" event. Mirrors `goods-receipt.ts`'s shape (no edit, only
 * delete-and-reregister) and `material.ts`'s cross-feature import
 * pattern (materials → purchases, never the reverse: purchase-totals.ts
 * only imports the `MaterialConsumption` *type*, never this file).
 *
 * Deliberately isolated from money: never imports `savePayable`,
 * `markPayableAsPaid`, `saveProjectCost`, or anything from
 * `features/payables`, `features/receivables`, or
 * `features/project-costs`. A MaterialConsumption changes only
 * physical-usage history — never a cost, payment, or cash figure.
 *
 * --- Two invariants, not one (Task 042A) ---
 *
 * "Total" invariant: `totalReceived >= totalConsumed` right now. This
 * alone is NOT sufficient — a Material can have enough received *in
 * total* while still having been physically unavailable on the actual
 * day it was marked as used (e.g. consuming on 05/09 from a delivery
 * that only arrives 10/09). So there is a second, stronger invariant:
 *
 * "Timeline" invariant: for every date D, `cumulativeReceived(D) >=
 * cumulativeConsumed(D)`, where both are summed only over events dated
 * on or before D. `isTimelineValid` is the single source of truth for
 * this check — `registerMaterialConsumption` and
 * `features/purchases/prototype/goods-receipt.ts#removeGoodsReceipt`
 * both call it (the latter simulating the receipt's removal by
 * excluding its events first) rather than each re-implementing their
 * own chronology math.
 *
 * The system has no time-of-day, only a date — so a GoodsReceipt and a
 * MaterialConsumption dated the very same day are aggregated together
 * before the cumulative check (see `isTimelineValid`): the day's
 * arrival can supply that same day's use. This is a deliberate product
 * decision, not an approximation.
 *
 * `available` (current, not date-scoped) is always
 * `totalReceived - totalConsumed`, derived from GoodsReceiptItem/
 * MaterialConsumption history — never persisted, never a mutable
 * "stock" field. `totalReceived` intentionally includes receipts from
 * PurchaseOrders that were later cancelled: the physical arrival
 * already happened and stays true regardless of the order's later
 * commercial status (same reasoning as `calculateMaterialPlanning` in
 * `features/purchases/prototype/purchase-totals.ts`).
 */

import { getProject } from "@/features/projects/prototype/project-store";
import { listPurchaseOrdersByProject } from "@/features/purchases/prototype/purchase-order-store";
import { listItemsByPurchaseOrders } from "@/features/purchases/prototype/purchase-order-item-store";
import { listReceiptItemsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-item-store";
import { listGoodsReceiptsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-store";
import { todayIso } from "@/lib/date";
import { isPositiveQuantity, normalizeQuantity, toQuantityUnits } from "@/lib/quantity";
import { getMaterial } from "./material-store";
import {
  createMaterialConsumptionId,
  deleteMaterialConsumption as deleteMaterialConsumptionRecord,
  listConsumptionsByProjectAndMaterial,
  saveMaterialConsumption,
} from "./material-consumption-store";
import type { MaterialConsumption } from "../types";

export type MaterialConsumptionResult =
  | { ok: true; consumption: MaterialConsumption }
  | { ok: false; error: string };
export type DomainResult = { ok: true } | { ok: false; error: string };

/** One physical arrival event, in normalized quantity units (see
 * `lib/quantity.ts`), tagged with the GoodsReceipt it came from so a
 * caller can exclude one specific GoodsReceipt when simulating its
 * removal. */
export interface ReceivedEvent {
  goodsReceiptId: string;
  date: string;
  units: number;
}

/** One physical usage event, tagged with the MaterialConsumption it
 * came from so a caller can exclude one specific entry (not currently
 * needed — removing a Consumption can never invalidate the timeline,
 * see the module doc comment — but kept symmetric with ReceivedEvent). */
export interface ConsumedEvent {
  consumptionId: string;
  date: string;
  units: number;
}

/** Every physical-arrival event for this Material at this Project,
 * across every PurchaseOrder regardless of current commercialStatus —
 * includes receipts from orders later cancelled (the physical arrival
 * already happened). One entry per GoodsReceiptItem. */
export function listReceivedEventsForProjectMaterial(
  projectId: string,
  materialId: string
): ReceivedEvent[] {
  const purchaseOrders = listPurchaseOrdersByProject(projectId);
  const materialItemIds = new Set(
    listItemsByPurchaseOrders(purchaseOrders.map((order) => order.id))
      .filter((item) => item.materialId === materialId)
      .map((item) => item.id)
  );

  const events: ReceivedEvent[] = [];
  for (const purchaseOrder of purchaseOrders) {
    for (const goodsReceipt of listGoodsReceiptsByPurchaseOrder(purchaseOrder.id)) {
      for (const receiptItem of listReceiptItemsByPurchaseOrder(purchaseOrder.id)) {
        if (receiptItem.goodsReceiptId !== goodsReceipt.id) continue;
        if (!materialItemIds.has(receiptItem.purchaseOrderItemId)) continue;
        events.push({
          goodsReceiptId: goodsReceipt.id,
          date: goodsReceipt.receivedAt,
          units: toQuantityUnits(receiptItem.quantity),
        });
      }
    }
  }
  return events;
}

/** Every physical-usage event for this Material at this Project. One
 * entry per MaterialConsumption. */
export function listConsumedEventsForProjectMaterial(
  projectId: string,
  materialId: string
): ConsumedEvent[] {
  return listConsumptionsByProjectAndMaterial(projectId, materialId).map((consumption) => ({
    consumptionId: consumption.id,
    date: consumption.consumedAt,
    units: toQuantityUnits(consumption.quantity),
  }));
}

/**
 * The single source of truth for chronological validity: given a set
 * of signed, dated events (positive = received, negative = consumed)
 * for one Project + Material, true iff the running balance never goes
 * negative on any date. Events are aggregated *by day* first — there
 * is no time-of-day in this system, so a receipt and a consumption
 * dated the same day are summed together before the cumulative check,
 * meaning a same-day arrival can supply a same-day use.
 */
export function isTimelineValid(events: { date: string; units: number }[]): boolean {
  const unitsByDate = new Map<string, number>();
  for (const event of events) {
    unitsByDate.set(event.date, (unitsByDate.get(event.date) ?? 0) + event.units);
  }
  const dates = Array.from(unitsByDate.keys()).sort();

  let cumulative = 0;
  for (const date of dates) {
    cumulative += unitsByDate.get(date)!;
    if (cumulative < 0) return false;
  }
  return true;
}

export function calculateTotalReceivedUnits(projectId: string, materialId: string): number {
  return listReceivedEventsForProjectMaterial(projectId, materialId).reduce(
    (sum, event) => sum + event.units,
    0
  );
}

export function calculateTotalConsumedUnits(projectId: string, materialId: string): number {
  return listConsumedEventsForProjectMaterial(projectId, materialId).reduce(
    (sum, event) => sum + event.units,
    0
  );
}

/**
 * Current (not date-scoped) available balance. With both invariants
 * enforced at write time, `receivedUnits >= consumedUnits` should
 * always hold — the `Math.max(..., 0)` below is kept only as a display
 * floor against pre-existing/out-of-band data (e.g. a browser that
 * still has localStorage written before this guard existed), never as
 * a substitute for validating the invariant itself. No write path in
 * this module relies on this clamp to stay correct.
 */
export function calculateAvailableQuantity(projectId: string, materialId: string): number {
  const receivedUnits = calculateTotalReceivedUnits(projectId, materialId);
  const consumedUnits = calculateTotalConsumedUnits(projectId, materialId);
  return Math.max(receivedUnits - consumedUnits, 0) / 1000;
}

export interface MaterialConsumptionInput {
  projectId: string;
  materialId: string;
  quantity: number;
  consumedAt: string;
  notes?: string;
}

export function registerMaterialConsumption(input: MaterialConsumptionInput): MaterialConsumptionResult {
  if (!getProject(input.projectId)) {
    return { ok: false, error: "Obra não encontrada." };
  }
  const material = getMaterial(input.materialId);
  if (!material) {
    return { ok: false, error: "Material não encontrado." };
  }
  if (input.consumedAt.trim() === "") {
    return { ok: false, error: "Informe a data de uso." };
  }
  if (input.consumedAt > todayIso()) {
    return { ok: false, error: "A data de uso não pode ser no futuro." };
  }
  if (!isPositiveQuantity(input.quantity)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }

  const receivedEvents = listReceivedEventsForProjectMaterial(input.projectId, input.materialId);
  if (receivedEvents.length === 0) {
    return {
      ok: false,
      error: "Não há material recebido disponível para uso nesta obra.",
    };
  }

  const consumedEvents = listConsumedEventsForProjectMaterial(input.projectId, input.materialId);
  const quantityUnits = toQuantityUnits(input.quantity);

  // Simulate the full timeline *with* this candidate consumption added —
  // not just "today's" total balance. A quantity that fits the current
  // grand total can still be invalid if it's dated earlier than a
  // delivery it would implicitly rely on (see module doc comment).
  // ConsumedEvent.units is a positive magnitude (see its doc comment) —
  // negate it here to turn it into a signed ledger entry for
  // `isTimelineValid`.
  const candidateEvents = [
    ...receivedEvents,
    ...consumedEvents.map((event) => ({ date: event.date, units: -event.units })),
    { date: input.consumedAt, units: -quantityUnits },
  ];
  if (!isTimelineValid(candidateEvents)) {
    return {
      ok: false,
      error: "Não há quantidade suficiente deste material disponível na data informada.",
    };
  }

  const now = todayIso();
  const consumption: MaterialConsumption = {
    id: createMaterialConsumptionId(),
    projectId: input.projectId,
    materialId: input.materialId,
    quantity: normalizeQuantity(input.quantity),
    consumedAt: input.consumedAt,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveMaterialConsumption(consumption);
  return { ok: true, consumption };
}

export function removeMaterialConsumption(consumption: MaterialConsumption): DomainResult {
  // Removing a Consumption only ever *increases* every date's cumulative
  // balance from that point on — it can never make the timeline invalid,
  // so no guard is needed here (see module doc comment).
  deleteMaterialConsumptionRecord(consumption.id);
  return { ok: true };
}
