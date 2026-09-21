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
 *
 * --- StockAdjustment joins the same ledger (Estoque 1A) ---
 *
 * `features/stock` adds one new physical fact this module didn't know
 * about: a manual `StockAdjustment` (initial count, breakage,
 * correction). Once that entity exists, "is there enough of this
 * Material available" can no longer be answered from GoodsReceipt/
 * Consumption alone — an `ADJUSTMENT_OUT` can make physically-received
 * stock unavailable, and an `ADJUSTMENT_IN` can make stock available
 * that never went through a GoodsReceipt at all (e.g. an opening
 * balance). `listLedgerEventsForProjectMaterial` is the one place that
 * merges all four event kinds into a single signed timeline; every
 * write-time guard in this codebase that needs to know "would this
 * leave the balance negative at any point in time" — this module's own
 * `registerMaterialConsumption`, `features/purchases/prototype/
 * goods-receipt.ts#removeGoodsReceipt`, and `features/stock/prototype/
 * stock.ts#createStockAdjustment` — calls this same function (or the
 * lower-level `listAdjustmentIn/OutEventsForProjectMaterial` pair when
 * it needs to exclude one specific source, mirroring how
 * `removeGoodsReceipt` already excludes its own ReceivedEvents) rather
 * than each re-deriving its own notion of "available". This keeps a
 * single ledger instead of the two independent formulas that existed
 * before this correction (`calculateAvailableQuantity`'s received-minus-
 * consumed vs. `features/stock/prototype/stock.ts`'s separate entradas+
 * ajustes-saídas math).
 *
 * Import direction note: this file (features/materials) now imports
 * `stock-adjustment-store.ts` (features/stock) — a leaf persistence
 * module with no domain logic and no imports back into `materials` or
 * `purchases` — so this stays a one-directional dependency, not a
 * cycle. `features/stock/prototype/stock.ts` continues to import this
 * file the other way (for the received/consumed primitives), which is
 * fine: `stock.ts` and `stock-adjustment-store.ts` are both leaves
 * relative to each other (neither imports the other), so there is no
 * cycle anywhere in this graph.
 */

import { listGoodsReceiptShadowEntriesForProjectMaterial } from "@/features/purchases/prototype/goods-receipt-shadow-store";
import { listStockAdjustmentsByProjectAndMaterial } from "@/features/stock/prototype/stock-adjustment-store";
import { todayIso } from "@/lib/date";
import { isPositiveQuantity, normalizeQuantity, toQuantityUnits } from "@/lib/quantity";
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

/**
 * Every physical-arrival event for this Material at this Project —
 * includes receipts from orders later cancelled (the physical arrival
 * already happened). SUPPLY-FRONTEND-01C: Purchase/GoodsReceipt are now
 * API-backed; this reads the local write-through mirror
 * (`goods-receipt-shadow-store.ts`) populated by the real
 * `GoodsReceiptForm`/`PurchaseOrderDetail` API mutations — never the
 * (now-removed) local Purchase/Receipt stores directly. One entry per
 * GoodsReceiptItem line.
 */
export function listReceivedEventsForProjectMaterial(
  projectId: string,
  materialId: string
): ReceivedEvent[] {
  return listGoodsReceiptShadowEntriesForProjectMaterial(projectId, materialId).map((entry) => ({
    goodsReceiptId: entry.goodsReceiptId,
    date: entry.receivedAt,
    units: toQuantityUnits(entry.quantity),
  }));
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

/** One manual stock-adjustment event, tagged with the StockAdjustment
 * it came from (symmetric with ReceivedEvent/ConsumedEvent). */
export interface AdjustmentEvent {
  stockAdjustmentId: string;
  date: string;
  units: number;
}

/** Every `ADJUSTMENT_IN` StockAdjustment for this Material at this
 * Project. */
export function listAdjustmentInEventsForProjectMaterial(
  projectId: string,
  materialId: string
): AdjustmentEvent[] {
  return listStockAdjustmentsByProjectAndMaterial(projectId, materialId)
    .filter((adjustment) => adjustment.type === "ADJUSTMENT_IN")
    .map((adjustment) => ({
      stockAdjustmentId: adjustment.id,
      date: adjustment.occurredAt,
      units: toQuantityUnits(adjustment.quantity),
    }));
}

/** Every `ADJUSTMENT_OUT` StockAdjustment for this Material at this
 * Project. */
export function listAdjustmentOutEventsForProjectMaterial(
  projectId: string,
  materialId: string
): AdjustmentEvent[] {
  return listStockAdjustmentsByProjectAndMaterial(projectId, materialId)
    .filter((adjustment) => adjustment.type === "ADJUSTMENT_OUT")
    .map((adjustment) => ({
      stockAdjustmentId: adjustment.id,
      date: adjustment.occurredAt,
      units: toQuantityUnits(adjustment.quantity),
    }));
}

/**
 * The single ledger: every signed event (positive = increases balance,
 * negative = decreases it) across all four sources — GoodsReceipt,
 * MaterialConsumption, ADJUSTMENT_IN, ADJUSTMENT_OUT — for one Project
 * + Material. Every write-time availability guard in this codebase
 * builds its candidate timeline from this function (or from the
 * lower-level per-source lists above when it needs to exclude one
 * specific event, e.g. `removeGoodsReceipt` simulating its own
 * removal) — see this module's doc comment ("StockAdjustment joins the
 * same ledger").
 */
export function listLedgerEventsForProjectMaterial(
  projectId: string,
  materialId: string
): { date: string; units: number }[] {
  return [
    ...listReceivedEventsForProjectMaterial(projectId, materialId).map((event) => ({
      date: event.date,
      units: event.units,
    })),
    ...listConsumedEventsForProjectMaterial(projectId, materialId).map((event) => ({
      date: event.date,
      units: -event.units,
    })),
    ...listAdjustmentInEventsForProjectMaterial(projectId, materialId).map((event) => ({
      date: event.date,
      units: event.units,
    })),
    ...listAdjustmentOutEventsForProjectMaterial(projectId, materialId).map((event) => ({
      date: event.date,
      units: -event.units,
    })),
  ];
}

/**
 * The single source of truth for chronological validity: given a set
 * of signed, dated events (positive = increases balance, negative =
 * decreases it) for one Project + Material, true iff the running
 * balance never goes negative on any date. Events are aggregated *by
 * day* first — there is no time-of-day in this system, so events dated
 * the same day are summed together before the cumulative check,
 * meaning a same-day arrival (GoodsReceipt or ADJUSTMENT_IN) can
 * supply a same-day use (Consumption or ADJUSTMENT_OUT). This same-day
 * aggregation rule predates StockAdjustment and is unchanged by it —
 * it now simply also applies to adjustment events.
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
 * Current (not date-scoped) available balance — the ledger total
 * (GoodsReceipt + ADJUSTMENT_IN - Consumption - ADJUSTMENT_OUT). With
 * every invariant enforced at write time this should never go
 * negative — the `Math.max(..., 0)` below is kept only as a display
 * floor against pre-existing/out-of-band data (e.g. a browser that
 * still has localStorage written before this guard existed), never as
 * a substitute for validating the invariant itself. No write path in
 * this module relies on this clamp to stay correct.
 */
export function calculateAvailableQuantity(projectId: string, materialId: string): number {
  const totalUnits = listLedgerEventsForProjectMaterial(projectId, materialId).reduce(
    (sum, event) => sum + event.units,
    0
  );
  return Math.max(totalUnits, 0) / 1000;
}

export interface MaterialConsumptionInput {
  projectId: string;
  materialId: string;
  quantity: number;
  consumedAt: string;
  notes?: string;
}

/**
 * SUPPLY-FRONTEND-01A §57: Material is now the real API master — this
 * function no longer imports `material-store.ts` (deleted) or calls any
 * synchronous local lookup. `materialExists` is the caller's own
 * API-resolved existence proof (`Boolean(useMaterial(materialId).material)`)
 * — never faked. Inactive Materials remain consumable (no `active`
 * check here), matching the pre-existing rule.
 */
export function registerMaterialConsumption(
  input: MaterialConsumptionInput,
  materialExists: boolean
): MaterialConsumptionResult {
  // §46: Project existence is no longer synchronously checkable here —
  // see the matching note in `material-requirement.ts`.
  if (!materialExists) {
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

  const ledgerEvents = listLedgerEventsForProjectMaterial(input.projectId, input.materialId);
  if (ledgerEvents.length === 0) {
    return {
      ok: false,
      error: "Não há material disponível para uso nesta obra.",
    };
  }

  const quantityUnits = toQuantityUnits(input.quantity);

  // Simulate the full ledger timeline *with* this candidate consumption
  // added — not just "today's" total balance. A quantity that fits the
  // current grand total can still be invalid if it's dated earlier than
  // a delivery/adjustment it would implicitly rely on (see module doc
  // comment). `listLedgerEventsForProjectMaterial` already includes
  // GoodsReceipt, prior Consumption, and every StockAdjustment (Estoque
  // 1A) — this module no longer looks at received/consumed in
  // isolation.
  const candidateEvents = [...ledgerEvents, { date: input.consumedAt, units: -quantityUnits }];
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
