/**
 * Prototype pricing for UI validation only — turns a pending calculator
 * item into a budget stage using the mocked prices in `src/mocks/pricing.ts`.
 * Real prices will come from organization/material data through Laravel.
 *
 * One small conversion function per calculator source. Not a generic
 * pricing engine — if a fifth calculator arrives, add a fifth function.
 */

import {
  auxiliaryMaterialPrice,
  ceilingPanelPricePerSquareMeter,
  ceilingRodaforroPricePerBar,
  floorMaterialPricePerSquareMeter,
  masonryMaterialUnitPrice,
  slabFillingUnitPrice,
} from "@/mocks/pricing";
import type {
  CeilingPendingBudgetItem,
  FloorPendingBudgetItem,
  MasonryPendingBudgetItem,
  PendingBudgetItem,
  SlabPendingBudgetItem,
} from "./pending-budget-item";
import type { CalculatedBudgetStage } from "../types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function stageId(title: string): string {
  return `${title.toLowerCase()}-${Date.now()}`;
}

function masonryItemToStage(item: MasonryPendingBudgetItem): CalculatedBudgetStage {
  const unitPrice = masonryMaterialUnitPrice[item.materialId] ?? 0;

  const materialsCost =
    item.quantity * unitPrice +
    item.auxiliaryMaterials.cementBags * auxiliaryMaterialPrice.cementPerBag +
    item.auxiliaryMaterials.limeBags * auxiliaryMaterialPrice.limePerBag +
    item.auxiliaryMaterials.sandM3 * auxiliaryMaterialPrice.sandPerM3;

  return {
    id: stageId(item.title),
    kind: "calculated",
    name: item.title,
    item: {
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
    },
    materialsCost: round2(materialsCost),
    laborCost: 0,
  };
}

function floorItemToStage(item: FloorPendingBudgetItem): CalculatedBudgetStage {
  const materialsCost = item.areaM2 * floorMaterialPricePerSquareMeter;

  return {
    id: stageId(item.title),
    kind: "calculated",
    name: item.title,
    item: {
      materialName: "Piso",
      quantity: item.boxes,
      unit: "caixas",
    },
    materialsCost: round2(materialsCost),
    laborCost: 0,
  };
}

function ceilingItemToStage(item: CeilingPendingBudgetItem): CalculatedBudgetStage {
  // Pricing stays area-based (materials catalog is genuinely R$/m² for
  // this product) — purchaseBars is the logistics quantity shown to the
  // user, not the pricing driver. See Demo-Ready 005C.
  const materialsCost =
    item.areaM2 * ceilingPanelPricePerSquareMeter +
    item.rodaforros * ceilingRodaforroPricePerBar;

  const materialName = item.panelsByLength
    .map((group) => `${group.panelLengthM} m`)
    .join(" + ");

  return {
    id: stageId(item.title),
    kind: "calculated",
    name: item.title,
    item: {
      materialName: `Placa de forro PVC (${materialName})`,
      quantity: item.totalPurchaseBars,
      unit: "barras",
    },
    materialsCost: round2(materialsCost),
    laborCost: 0,
  };
}

function slabItemToStage(item: SlabPendingBudgetItem): CalculatedBudgetStage {
  // cementBags/sandM3/gravelM3 are already derived from the final,
  // waste-included volume (see slab-calculator.tsx), so materialsCost is
  // consistent with concreteVolumeWithWasteM3, not the base volume.
  const materialsCost =
    item.cementBags * auxiliaryMaterialPrice.cementPerBag +
    item.sandM3 * auxiliaryMaterialPrice.sandPerM3 +
    item.gravelM3 * auxiliaryMaterialPrice.gravelPerM3 +
    item.fillingUnits * slabFillingUnitPrice;

  return {
    id: stageId(item.title),
    kind: "calculated",
    name: item.title,
    item: {
      materialName: `Concreto (${item.slabTypeLabel})`,
      quantity: round2(item.concreteVolumeWithWasteM3),
      unit: "m³",
    },
    materialsCost: round2(materialsCost),
    laborCost: 0,
  };
}

export function pendingItemToStage(item: PendingBudgetItem): CalculatedBudgetStage {
  switch (item.source) {
    case "masonry":
      return masonryItemToStage(item);
    case "floor":
      return floorItemToStage(item);
    case "ceiling":
      return ceilingItemToStage(item);
    case "slab":
      return slabItemToStage(item);
  }
}
