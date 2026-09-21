import { beforeEach, describe, expect, it } from "vitest";

import {
  hasAnyLocalMaterialDependency,
  hasLocalConsumption,
  hasLocalPurchaseOrderItem,
  hasLocalStockAdjustment,
} from "../prototype/material-local-dependencies";
import { saveRequirement } from "../prototype/material-requirement-store";
import { saveMaterialConsumption } from "../prototype/material-consumption-store";
import { savePurchaseOrderItem } from "@/features/purchases/prototype/purchase-order-item-store";
import { saveStockAdjustment } from "@/features/stock/prototype/stock-adjustment-store";

const MATERIAL_ID = "material-1";

/**
 * SUPPLY-FRONTEND-01A §28-29 / SUPPLY-FRONTEND-01B §32-34 (TG1-TG4).
 * Proves the transitional local-dependency helper now reads ONLY the
 * THREE remaining local child stores (PurchaseOrderItem/Consumption/
 * StockAdjustment) — MaterialRequirement is real API now, and the
 * backend's own 422 guard (`MaterialRequirementService`) protects
 * unit-change/delete against it; duplicating that check locally would
 * just re-run a rule the server already enforces.
 */
describe("material-local-dependencies — SUPPLY-FRONTEND-01B §32-34", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("hasAnyLocalMaterialDependency is false with zero local children", () => {
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(false);
  });

  it("TG1: a local (legacy) MaterialRequirement is NO LONGER a local dependency — hasLocalMaterialRequirement is gone", () => {
    saveRequirement({
      id: "req-1",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      requiredQuantity: 10,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(false);
  });

  it("TG2: hasLocalPurchaseOrderItem still detects and still blocks", () => {
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

  it("TG3: hasLocalConsumption still detects and still blocks", () => {
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

  it("TG4: hasLocalStockAdjustment still detects and still blocks", () => {
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
    savePurchaseOrderItem({
      id: "item-2",
      purchaseOrderId: "po-1",
      materialId: MATERIAL_ID,
      description: "Cimento",
      unit: { code: "sc" },
      quantity: 10,
      unitPrice: 25,
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasAnyLocalMaterialDependency("material-other")).toBe(false);
  });
});
