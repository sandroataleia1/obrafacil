/**
 * Derived "Estoque" (stock) domain — the balance for a Project+Material
 * is never persisted, never a mutable field. It is always computed from
 * three sources at read time:
 *
 * - GoodsReceiptItem (physical arrival) — already the source of truth
 *   for "how much arrived", read via `listReceivedEventsForProjectMaterial`
 *   (features/materials/prototype/material-consumption.ts), never
 *   duplicated into a second record here.
 * - MaterialConsumption (physical usage) — already the source of truth
 *   for "how much was used", read via `listConsumedEventsForProjectMaterial`,
 *   same file, same non-duplication rule.
 * - StockAdjustment (this feature's one new entity) — manual
 *   corrections that don't originate from either of the above.
 *
 * --- Estoque 1A: one ledger, not two formulas ---
 *
 * Earlier this module computed its own separate "entradas + ajustes -
 * saídas - ajustes" total, independent of `material-consumption.ts`'s
 * `calculateAvailableQuantity`/`registerMaterialConsumption` (which knew
 * nothing about StockAdjustment). That meant two different answers to
 * "how much is available" could disagree. `createStockAdjustment` below
 * now validates against `listLedgerEventsForProjectMaterial` +
 * `isTimelineValid` — the exact same functions `registerMaterialConsumption`
 * and `removeGoodsReceipt` use — so every write-time guard in the
 * codebase shares one ledger.
 *
 * --- Estoque 1B: one balance, not two read-side formulas ---
 *
 * 1A fixed every *write-time guard*, but the *read-side* balance (what
 * a viewer sees on the list/detail) still had its own independent sum
 * (`totalIn - totalOut`, partitioned from `listStockMovements`) that
 * only happened to agree with `calculateAvailableQuantity` because both
 * summed the same underlying events through different code paths.
 * `getStockBalance` now delegates directly to `calculateAvailableQuantity`
 * — the one canonical balance function — and `getStockTotals.balance`
 * does the same, never recalculating `totalIn - totalOut` on its own.
 * `totalIn`/`totalOut` themselves stay derived from `listStockMovements`
 * (they are presentation aggregates with no other reasonable home —
 * `material-consumption.ts` has no reason to know about a UI-shaped
 * "how much arrived in total" figure), so `listStockMovements` and
 * `getStockTotals`'s in/out split are unchanged. No cycle: neither
 * `getStockBalance` nor `getStockTotals` call each other — both call
 * `calculateAvailableQuantity` independently.
 */

import { todayIso } from "@/lib/date";
import { isPositiveQuantity, normalizeQuantity, toQuantityUnits } from "@/lib/quantity";
import { getProject } from "@/features/projects/prototype/project-store";
import { getMaterial } from "@/features/materials/prototype/material-store";
import {
  calculateAvailableQuantity,
  isTimelineValid,
  listConsumedEventsForProjectMaterial,
  listLedgerEventsForProjectMaterial,
  listReceivedEventsForProjectMaterial,
} from "@/features/materials/prototype/material-consumption";
import { listMaterialConsumptions } from "@/features/materials/prototype/material-consumption-store";
import { getGoodsReceipt } from "@/features/purchases/prototype/goods-receipt-store";
import { listAllGoodsReceiptItems } from "@/features/purchases/prototype/goods-receipt-item-store";
import { getPurchaseOrder } from "@/features/purchases/prototype/purchase-order-store";
import { getPurchaseOrderItem } from "@/features/purchases/prototype/purchase-order-item-store";
import {
  createStockAdjustmentId,
  listAllStockAdjustments,
  listStockAdjustmentsByProjectAndMaterial,
  saveStockAdjustment,
} from "./stock-adjustment-store";
import type { StockAdjustment, StockAdjustmentType, StockMovement, StockPosition } from "../types";

export type StockAdjustmentResult =
  | { ok: true; adjustment: StockAdjustment }
  | { ok: false; error: string };

function sortMovementsDesc(a: StockMovement, b: StockMovement): number {
  return b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id);
}

/**
 * Single source of truth for the movement history of one Project+
 * Material pair. Card/list/detail/balance all consume this — none of
 * them re-derive entradas/saídas independently.
 */
export function listStockMovements(projectId: string, materialId: string): StockMovement[] {
  const received: StockMovement[] = listReceivedEventsForProjectMaterial(projectId, materialId).map(
    (event) => ({
      id: `goods-receipt:${event.goodsReceiptId}`,
      projectId,
      materialId,
      type: "IN",
      quantity: event.units / 1000,
      occurredAt: event.date,
      sourceType: "GOODS_RECEIPT",
      sourceId: event.goodsReceiptId,
    })
  );

  const consumed: StockMovement[] = listConsumedEventsForProjectMaterial(projectId, materialId).map(
    (event) => ({
      id: `consumption:${event.consumptionId}`,
      projectId,
      materialId,
      type: "OUT",
      quantity: event.units / 1000,
      occurredAt: event.date,
      sourceType: "CONSUMPTION",
      sourceId: event.consumptionId,
    })
  );

  const adjusted: StockMovement[] = listStockAdjustmentsByProjectAndMaterial(projectId, materialId).map(
    (adjustment) => ({
      id: `adjustment:${adjustment.id}`,
      projectId,
      materialId,
      type: adjustment.type,
      quantity: adjustment.quantity,
      occurredAt: adjustment.occurredAt,
      sourceType: "MANUAL_ADJUSTMENT",
      sourceId: adjustment.id,
      note: adjustment.reason,
    })
  );

  return [...received, ...consumed, ...adjusted].sort(sortMovementsDesc);
}

export interface StockTotals {
  totalIn: number;
  totalOut: number;
  balance: number;
}

/**
 * `totalIn`/`totalOut` are presentation aggregates (the list/detail
 * "Entradas"/"Saídas" columns) — they legitimately have no other home
 * than partitioning `listStockMovements` by sign, computed in integer
 * quantity-units to avoid float boundary errors (mirrors `toCents`'s
 * reasoning for money — see `lib/quantity.ts`). `balance` is NOT a
 * third independent formula: it comes from `calculateAvailableQuantity`
 * (`features/materials/prototype/material-consumption.ts`), the one
 * canonical source of "how much is available" every write-time guard
 * in this codebase also uses (Estoque 1B — see `getStockBalance`
 * below, which delegates the same way, so `getStockTotals` cannot
 * recurse through it).
 */
export function getStockTotals(projectId: string, materialId: string): StockTotals {
  let inUnits = 0;
  let outUnits = 0;
  for (const movement of listStockMovements(projectId, materialId)) {
    const units = toQuantityUnits(movement.quantity);
    if (movement.type === "IN" || movement.type === "ADJUSTMENT_IN") {
      inUnits += units;
    } else {
      outUnits += units;
    }
  }
  return {
    totalIn: inUnits / 1000,
    totalOut: outUnits / 1000,
    balance: calculateAvailableQuantity(projectId, materialId),
  };
}

/** Delegates directly to the canonical balance function — never
 * recalculates entradas/saídas independently (Estoque 1B). */
export function getStockBalance(projectId: string, materialId: string): number {
  return calculateAvailableQuantity(projectId, materialId);
}

/**
 * Every Project+Material pair that has at least one movement (from any
 * of the three sources), each with its totals already computed. A
 * Material never gets an automatic row for every Obra just because it
 * exists in the catalog — only pairs with real history appear (Pilot-
 * Ready "Estoque Básico por Obra" §13).
 */
export function listStockPositions(): StockPosition[] {
  const pairs = new Map<string, { projectId: string; materialId: string }>();

  for (const receiptItem of listAllGoodsReceiptItems()) {
    const orderItem = getPurchaseOrderItem(receiptItem.purchaseOrderItemId);
    if (!orderItem) continue;
    const goodsReceipt = getGoodsReceipt(receiptItem.goodsReceiptId);
    if (!goodsReceipt) continue;
    const purchaseOrder = getPurchaseOrder(goodsReceipt.purchaseOrderId);
    if (!purchaseOrder) continue;
    pairs.set(`${purchaseOrder.projectId}::${orderItem.materialId}`, {
      projectId: purchaseOrder.projectId,
      materialId: orderItem.materialId,
    });
  }

  for (const consumption of listMaterialConsumptions()) {
    pairs.set(`${consumption.projectId}::${consumption.materialId}`, {
      projectId: consumption.projectId,
      materialId: consumption.materialId,
    });
  }

  for (const adjustment of listAllStockAdjustments()) {
    pairs.set(`${adjustment.projectId}::${adjustment.materialId}`, {
      projectId: adjustment.projectId,
      materialId: adjustment.materialId,
    });
  }

  return Array.from(pairs.values()).map(({ projectId, materialId }) => ({
    projectId,
    materialId,
    ...getStockTotals(projectId, materialId),
  }));
}

export interface StockAdjustmentInput {
  projectId: string;
  materialId: string;
  type: StockAdjustmentType;
  quantity: number;
  occurredAt: string;
  reason?: string;
}

/**
 * The only write path for a manual movement — never lets a caller set
 * `balance = X` directly. An `ADJUSTMENT_OUT` is validated against the
 * *entire* ledger timeline (`listLedgerEventsForProjectMaterial` +
 * `isTimelineValid`, both from `material-consumption.ts`), not just
 * today's aggregate balance: the candidate event is inserted at its own
 * `occurredAt` date and every date's cumulative balance is re-checked.
 * This is what blocks a retroactive adjustment that a *later* event
 * (a future GoodsReceipt, or an adjustment dated after it) would
 * otherwise appear to "cover" — a later arrival can never retroactively
 * finance an earlier shortfall (Estoque 1A §7/§8). `ADJUSTMENT_IN` is
 * run through the same check for symmetry, though a purely positive
 * event can never fail it (mirrors `removeMaterialConsumption`'s
 * reasoning that a balance-increasing change can never invalidate a
 * timeline that was already valid).
 */
export function createStockAdjustment(input: StockAdjustmentInput): StockAdjustmentResult {
  if (!getProject(input.projectId)) {
    return { ok: false, error: "Obra não encontrada." };
  }
  if (!getMaterial(input.materialId)) {
    return { ok: false, error: "Material não encontrado." };
  }
  if (!isPositiveQuantity(input.quantity)) {
    return { ok: false, error: "Informe uma quantidade maior que zero." };
  }
  if (input.occurredAt.trim() === "") {
    return { ok: false, error: "Informe a data do ajuste." };
  }
  if (input.occurredAt > todayIso()) {
    return { ok: false, error: "A data não pode ser no futuro." };
  }

  const quantityUnits = toQuantityUnits(input.quantity);
  const signedUnits = input.type === "ADJUSTMENT_IN" ? quantityUnits : -quantityUnits;
  const candidateEvents = [
    ...listLedgerEventsForProjectMaterial(input.projectId, input.materialId),
    { date: input.occurredAt, units: signedUnits },
  ];
  if (!isTimelineValid(candidateEvents)) {
    return {
      ok: false,
      error:
        "Esta operação deixaria o saldo negativo em algum momento da linha do tempo. Verifique a data e a quantidade.",
    };
  }

  const now = todayIso();
  const adjustment: StockAdjustment = {
    id: createStockAdjustmentId(),
    projectId: input.projectId,
    materialId: input.materialId,
    type: input.type,
    quantity: normalizeQuantity(input.quantity),
    occurredAt: input.occurredAt,
    reason: input.reason?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  saveStockAdjustment(adjustment);
  return { ok: true, adjustment };
}
