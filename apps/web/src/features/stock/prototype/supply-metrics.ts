/**
 * Cobertura de materiais — Pilot-Ready "Estoque 1.1". Connects data
 * that already exists (MaterialRequirement, PurchaseOrder/Item,
 * GoodsReceipt/Item, MaterialConsumption, the Estoque V1 ledger) to
 * answer, per Project+Material: quanto é necessário, quanto já foi
 * comprado, quanto chegou, quanto foi consumido, quanto existe agora,
 * quanto está a caminho, e quanto ainda falta comprar.
 *
 * Deliberately does NOT touch the Estoque V1 ledger (`stock.ts`'s
 * `listLedgerEventsForProjectMaterial`/`isTimelineValid`/
 * `calculateAvailableQuantity`/`registerMaterialConsumption`/
 * `createStockAdjustment`) — those stay frozen. This module only reads
 * from them (`calculateAvailableQuantity` for "estoque atual") and
 * from `features/purchases/prototype/purchase-totals.ts#calculateMaterialPlanning`
 * for "necessário"/"comprado"/"recebido"/"consumido" — that function
 * already encodes the exact domain rules audited for this round:
 *   - `draft` PurchaseOrders contribute 0 to "comprado" (not a real
 *     commitment yet);
 *   - `ordered` PurchaseOrders contribute their full item quantity,
 *     regardless of how much has been received so far;
 *   - `cancelled` PurchaseOrders contribute only what was physically
 *     received before cancellation (a partial delivery's history never
 *     disappears);
 *   - "recebido" sums every GoodsReceiptItem regardless of the owning
 *     order's current status;
 *   - "consumido" sums every MaterialConsumption.
 * Reusing it here — instead of re-deriving "comprado"/"recebido" from
 * scratch — is what keeps this a single definition of each metric
 * (Pilot-Ready "Estoque 1.1" §7/§8, mirrors the "no duplicated ledger
 * formula" rule already enforced for Estoque 1A/1B).
 *
 * `stock` (estoque atual) intentionally does NOT reuse
 * `calculateMaterialPlanning`'s own `available` field — that field is
 * the pre-StockAdjustment received-minus-consumed figure, kept for
 * `features/materials`' own planning UI, which this round does not
 * touch. "Estoque atual" here is always `calculateAvailableQuantity`,
 * the canonical V1 balance (received + adjustmentIn - consumed -
 * adjustmentOut), the same value shown in `/estoque`'s existing detail
 * screen.
 *
 * StockAdjustment deliberately never touches "comprado"/"recebido"/
 * "consumido" here — an ADJUSTMENT_IN can raise `stock` (e.g. an
 * opening balance) without any PurchaseOrder or GoodsReceipt ever
 * existing; an ADJUSTMENT_OUT (e.g. breakage) can lower `stock`
 * without touching `consumed`. Both participate only through `stock`
 * itself, which already includes them via `calculateAvailableQuantity`.
 */

import { toQuantityUnits } from "@/lib/quantity";
import { findRequirement, listRequirements } from "@/features/materials/prototype/material-requirement-store";
import { calculateAvailableQuantity } from "@/features/materials/prototype/material-consumption";
import { listConsumptionsByProject } from "@/features/materials/prototype/material-consumption-store";
import { calculateMaterialPlanning } from "@/features/purchases/prototype/purchase-totals";
import { listPurchaseOrders, listPurchaseOrdersByProject } from "@/features/purchases/prototype/purchase-order-store";
import {
  listItemsByPurchaseOrder,
  listItemsByPurchaseOrders,
} from "@/features/purchases/prototype/purchase-order-item-store";
import { listReceiptItemsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-item-store";
import { listStockPositions } from "./stock";

/**
 * `required`/`missingToPurchase` are `null` when there is no
 * MaterialRequirement for this Project+Material — "não planejado" is a
 * distinct state from "planejado como zero" (Pilot-Ready "Estoque 1.1"
 * §22): a Material with real stock/purchase history but no formal
 * requirement must never be silently read as "necessário = 0".
 */
export interface ProjectMaterialSupplyMetrics {
  required: number | null;
  purchased: number;
  received: number;
  consumed: number;
  stock: number;
  pendingReceipt: number;
  missingToPurchase: number | null;
}

/**
 * `pendingReceipt` ("a receber") = max(comprado - recebido, 0) —
 * StockAdjustment never participates. `missingToPurchase` ("falta
 * comprar") = max(necessário - consumido - estoque atual - a receber,
 * 0) — the full coverage formula (Pilot-Ready "Estoque 1.1" §12):
 * consumption already satisfied part of the requirement, physical
 * stock (however it arrived — receipt or adjustment) covers more of
 * it, and whatever is already contracted but not yet arrived covers
 * the rest. Only the true remainder still needs a new purchase.
 */
export function getProjectMaterialSupplyMetrics(
  projectId: string,
  materialId: string
): ProjectMaterialSupplyMetrics {
  const purchaseOrders = listPurchaseOrdersByProject(projectId);
  const items = listItemsByPurchaseOrders(purchaseOrders.map((purchaseOrder) => purchaseOrder.id));
  const receiptItems = purchaseOrders.flatMap((purchaseOrder) =>
    listReceiptItemsByPurchaseOrder(purchaseOrder.id)
  );
  const consumptions = listConsumptionsByProject(projectId);
  const requirement = findRequirement(projectId, materialId);

  const planning = calculateMaterialPlanning(
    requirement?.requiredQuantity ?? null,
    purchaseOrders,
    items,
    receiptItems,
    consumptions,
    materialId
  );

  const stock = calculateAvailableQuantity(projectId, materialId);

  const purchasedUnits = toQuantityUnits(planning.purchased);
  const receivedUnits = toQuantityUnits(planning.received);
  const pendingReceiptUnits = Math.max(purchasedUnits - receivedUnits, 0);

  const requiredUnits = planning.required === null ? null : toQuantityUnits(planning.required);
  const missingToPurchaseUnits =
    requiredUnits === null
      ? null
      : Math.max(
          requiredUnits -
            toQuantityUnits(planning.consumed) -
            toQuantityUnits(stock) -
            pendingReceiptUnits,
          0
        );

  return {
    required: planning.required,
    purchased: planning.purchased,
    received: planning.received,
    consumed: planning.consumed,
    stock,
    pendingReceipt: pendingReceiptUnits / 1000,
    missingToPurchase: missingToPurchaseUnits === null ? null : missingToPurchaseUnits / 1000,
  };
}

export interface StockSupplyPosition extends ProjectMaterialSupplyMetrics {
  projectId: string;
  materialId: string;
}

/**
 * Every Project+Material pair worth showing in `/estoque` — the union
 * of pairs already discovered by physical movement (`listStockPositions`,
 * Estoque V1, untouched) with pairs that only have a planned
 * requirement or a real, *still-valid* purchase commitment but no
 * physical fact yet (Pilot-Ready "Estoque 1.1" §15 — a material 100%
 * "falta comprar" is exactly the case this screen most needs to
 * surface).
 *
 * Only `ordered` PurchaseOrders contribute a pair here (Estoque 1.1
 * correction §1): `draft` was already excluded (never a real
 * commitment); `cancelled` is now excluded too, regardless of whether
 * it ever had a receipt —
 *   - a `cancelled` order with zero GoodsReceipt represents nothing
 *     operationally relevant any more (the commitment was withdrawn
 *     before anything physical happened), so it must not conjure a
 *     phantom position out of thin air;
 *   - a `cancelled` order that *did* receive part of its items before
 *     cancellation doesn't need this loop to surface it at all —
 *     `listStockPositions` (Estoque V1, untouched) already discovers
 *     that pair from the real GoodsReceiptItem history, which is the
 *     correct source for a physical fact regardless of the order's
 *     later commercial status (same reasoning `calculateMaterialPlanning`
 *     already uses for "recebido").
 * This mirrors `commercialStatus === "ordered"` exactly — no new
 * status helper needed, and no duplication of `calculateMaterialPlanning`'s
 * own financial logic (that function is only for the metrics, this
 * loop is only for discovering which pairs to compute metrics for).
 */
export function listSupplyPositions(): StockSupplyPosition[] {
  const pairs = new Map<string, { projectId: string; materialId: string }>();

  for (const position of listStockPositions()) {
    pairs.set(`${position.projectId}::${position.materialId}`, {
      projectId: position.projectId,
      materialId: position.materialId,
    });
  }

  for (const requirement of listRequirements()) {
    pairs.set(`${requirement.projectId}::${requirement.materialId}`, {
      projectId: requirement.projectId,
      materialId: requirement.materialId,
    });
  }

  for (const purchaseOrder of listPurchaseOrders()) {
    if (purchaseOrder.commercialStatus !== "ordered") continue;
    for (const item of listItemsByPurchaseOrder(purchaseOrder.id)) {
      pairs.set(`${purchaseOrder.projectId}::${item.materialId}`, {
        projectId: purchaseOrder.projectId,
        materialId: item.materialId,
      });
    }
  }

  return Array.from(pairs.values()).map(({ projectId, materialId }) => ({
    projectId,
    materialId,
    ...getProjectMaterialSupplyMetrics(projectId, materialId),
  }));
}
