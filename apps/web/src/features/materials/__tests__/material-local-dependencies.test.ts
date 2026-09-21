import { beforeEach, describe, expect, it } from "vitest";

import {
  hasAnyLocalMaterialDependency,
  hasLocalConsumption,
  hasLocalMaterialRequirement,
  hasLocalPurchaseOrderItem,
  hasLocalStockAdjustment,
} from "../prototype/material-local-dependencies";
import { saveRequirement } from "../prototype/material-requirement-store";
import { saveMaterialConsumption } from "../prototype/material-consumption-store";
import { savePurchaseOrderItem } from "@/features/purchases/prototype/purchase-order-item-store";
import { saveStockAdjustment } from "@/features/stock/prototype/stock-adjustment-store";

const MATERIAL_ID = "material-1";

/**
 * SUPPLY-FRONTEND-01A §28-29, MF14/MF15/DC-adjacent. Proves the
 * transitional local-dependency helper reads ONLY the four local child
 * stores it's documented to — never Material master identity itself.
 */
describe("material-local-dependencies — SUPPLY-FRONTEND-01A §28-29", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("hasAnyLocalMaterialDependency is false with zero local children", () => {
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(false);
  });

  it("hasLocalMaterialRequirement detects a local MaterialRequirement", () => {
    saveRequirement({
      id: "req-1",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      requiredQuantity: 10,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasLocalMaterialRequirement(MATERIAL_ID)).toBe(true);
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(true);
  });

  it("hasLocalPurchaseOrderItem detects a local PurchaseOrderItem", () => {
    savePurchaseOrderItem({
      id: "item-1",
      purchaseOrderId: "po-1",
      materialId: MATERIAL_ID,
      description: "Cimento",
      unit: { code: "sc" },
      quantity: 10,
      unitPrice: 25,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasLocalPurchaseOrderItem(MATERIAL_ID)).toBe(true);
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(true);
  });

  it("hasLocalConsumption detects a local MaterialConsumption", () => {
    saveMaterialConsumption({
      id: "cons-1",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      quantity: 5,
      consumedAt: "2026-09-10",
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasLocalConsumption(MATERIAL_ID)).toBe(true);
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(true);
  });

  it("hasLocalStockAdjustment detects a local StockAdjustment", () => {
    saveStockAdjustment({
      id: "adj-1",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      type: "ADJUSTMENT_IN",
      quantity: 5,
      occurredAt: "2026-09-10",
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasLocalStockAdjustment(MATERIAL_ID)).toBe(true);
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(true);
  });

  it("a different Material is unaffected by another Material's local dependency", () => {
    saveRequirement({
      id: "req-1",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      requiredQuantity: 10,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasAnyLocalMaterialDependency("material-other")).toBe(false);
  });
});
