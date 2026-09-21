import { beforeEach, describe, expect, it } from "vitest";

import { hasAnyLocalMaterialDependency, hasLocalConsumption, hasLocalStockAdjustment } from "../prototype/material-local-dependencies";
import { saveMaterialConsumption } from "../prototype/material-consumption-store";
import { saveStockAdjustment } from "@/features/stock/prototype/stock-adjustment-store";

const MATERIAL_ID = "material-1";

/**
 * SUPPLY-FRONTEND-01A §28-29 / SUPPLY-FRONTEND-01B1 §32-34 / SUPPLY-
 * FRONTEND-01C §53 (TG1/TG3/TG4). Proves the transitional local-
 * dependency helper now reads ONLY the TWO remaining local child stores
 * (Consumption/StockAdjustment) — MaterialRequirement/PurchaseOrderItem
 * are real API now, and the backend's own guards protect unit-change/
 * delete against both; duplicating those checks locally would just
 * re-run a rule the server already enforces.
 */
describe("material-local-dependencies — SUPPLY-FRONTEND-01C §53", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("hasAnyLocalMaterialDependency is false with zero local children", () => {
    expect(hasAnyLocalMaterialDependency(MATERIAL_ID)).toBe(false);
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
    saveMaterialConsumption({
      id: "cons-2",
      projectId: "project-1",
      materialId: MATERIAL_ID,
      quantity: 5,
      consumedAt: "2026-09-10",
      createdAt: "2026-09-10",
      updatedAt: "2026-09-10",
    });

    expect(hasAnyLocalMaterialDependency("material-other")).toBe(false);
  });
});
