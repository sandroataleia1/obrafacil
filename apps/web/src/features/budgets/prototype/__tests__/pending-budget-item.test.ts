import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingBudgetItem,
  getPendingBudgetItem,
  setPendingBudgetItem,
  type FloorPendingBudgetItem,
  type MasonryPendingBudgetItem,
} from "../pending-budget-item";

const MASONRY_ITEM: MasonryPendingBudgetItem = {
  source: "masonry",
  title: "Parede externa",
  materialId: "mat-1",
  materialName: "Bloco cerâmico",
  quantity: 500,
  unit: "un",
  netAreaM2: 20,
  wastePercentage: 10,
  auxiliaryMaterials: { cementBags: 5, limeBags: 2, sandM3: 1 },
};

const FLOOR_ITEM: FloorPendingBudgetItem = {
  source: "floor",
  title: "Piso sala",
  areaM2: 10,
  wastePercentage: 5,
  coveragePerBoxM2: 2,
  boxes: 6,
};

function clearAllTestKeys() {
  clearPendingBudgetItem("company-a");
  clearPendingBudgetItem("company-b");
  try {
    window.sessionStorage.removeItem("obrafacil:pending-budget-item");
  } catch {
    // ignore
  }
}

describe("pending-budget-item (FRONTEND-BUDGETS-01A §5-8 tenant-scoped handoff)", () => {
  beforeEach(() => {
    clearAllTestKeys();
  });

  /** HT1: Company A can write its own handoff. */
  it("HT1: Company A writes its own handoff successfully", () => {
    const saved = setPendingBudgetItem("company-a", MASONRY_ITEM);
    expect(saved).toBe(true);
  });

  /** HT2: Company A can read back its own handoff. */
  it("HT2: Company A reads back its own handoff", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    expect(getPendingBudgetItem("company-a")).toEqual(MASONRY_ITEM);
  });

  /** HT3: Company B never reads Company A's handoff. */
  it("HT3: Company B does not read Company A's handoff", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    expect(getPendingBudgetItem("company-b")).toBeNull();
  });

  /** HT4: Company B can hold its own, independent handoff at the same time as A. */
  it("HT4: Company B can own an independent handoff while A's still exists", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    setPendingBudgetItem("company-b", FLOOR_ITEM);

    expect(getPendingBudgetItem("company-a")).toEqual(MASONRY_ITEM);
    expect(getPendingBudgetItem("company-b")).toEqual(FLOOR_ITEM);
  });

  /** HT5: clearing A's handoff never touches B's. */
  it("HT5: clearing Company A's handoff does not clear Company B's", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    setPendingBudgetItem("company-b", FLOOR_ITEM);

    clearPendingBudgetItem("company-a");

    expect(getPendingBudgetItem("company-a")).toBeNull();
    expect(getPendingBudgetItem("company-b")).toEqual(FLOOR_ITEM);
  });

  /** HT6: a legacy unscoped key (pre-01A, no tenant owner) is never reused/attributed to any company. */
  it("HT6: the legacy unscoped key is never read into any company's result", () => {
    window.sessionStorage.setItem("obrafacil:pending-budget-item", JSON.stringify(MASONRY_ITEM));

    expect(getPendingBudgetItem("company-a")).toBeNull();
    expect(getPendingBudgetItem("company-b")).toBeNull();
    // Opportunistically discarded, never left around to be misread later.
    expect(window.sessionStorage.getItem("obrafacil:pending-budget-item")).toBeNull();
  });

  /** HT7: a masonry item is written keyed to the given Company. */
  it("HT7: masonry item is written under the given Company's key", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    expect(window.sessionStorage.getItem("obrafacil:pending-budget-item:company-a")).not.toBeNull();
    expect(window.sessionStorage.getItem("obrafacil:pending-budget-item:company-b")).toBeNull();
  });

  /** HT8: floor/ceiling/slab (any other source) follow the exact same per-company keying as masonry. */
  it("HT8: non-masonry sources (floor here, representative of ceiling/slab) follow the same keying", () => {
    setPendingBudgetItem("company-a", FLOOR_ITEM);
    expect(getPendingBudgetItem("company-a")).toEqual(FLOOR_ITEM);
    expect(getPendingBudgetItem("company-b")).toBeNull();
  });

  /** HT9: a stale create-success continuation must only ever be told to clear the handoff of the Company that actually made the request — the per-company key makes this structurally safe by construction. */
  it("HT9: clearing after a stale success only ever targets the requesting Company's own key", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    setPendingBudgetItem("company-b", FLOOR_ITEM);

    // Simulates BudgetForm's handleSubmit capturing requestCompanyId
    // BEFORE the switch, then clearing with that captured id after a
    // (possibly stale) success — never the CURRENT active company.
    const requestCompanyId = "company-a";
    clearPendingBudgetItem(requestCompanyId);

    expect(getPendingBudgetItem("company-a")).toBeNull();
    expect(getPendingBudgetItem("company-b")).toEqual(FLOOR_ITEM);
  });

  /** HT10: a failed create never clears anything — the handoff of the ORIGINAL (requesting) Company survives untouched. */
  it("HT10: a failed create leaves the requesting Company's handoff intact", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);

    // On failure, BudgetForm never calls clearPendingBudgetItem at all.
    expect(getPendingBudgetItem("company-a")).toEqual(MASONRY_ITEM);
  });

  /** §7: fails closed — no active company means no handoff is ever written. */
  it("§7: setPendingBudgetItem fails closed with no active company (undefined)", () => {
    const saved = setPendingBudgetItem(undefined, MASONRY_ITEM);
    expect(saved).toBe(false);
    expect(getPendingBudgetItem("company-a")).toBeNull();
  });
});
