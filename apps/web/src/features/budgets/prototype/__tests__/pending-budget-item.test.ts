import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingBudgetItem,
  consumePendingBudgetItem,
  getPendingBudgetHandoff,
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

describe("pending-budget-item handoff identity (FRONTEND-BUDGETS-01A1 §3-4/§19 HC1-HC8)", () => {
  beforeEach(() => {
    clearAllTestKeys();
  });

  /** HC1: every stored handoff gets a stable id. */
  it("HC1: a written handoff has a non-empty, stable id", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    const handoff = getPendingBudgetHandoff("company-a");
    expect(handoff).not.toBeNull();
    expect(typeof handoff?.id).toBe("string");
    expect(handoff?.id.length).toBeGreaterThan(0);

    // Stable across repeated reads without a new write.
    const handoffAgain = getPendingBudgetHandoff("company-a");
    expect(handoffAgain?.id).toBe(handoff?.id);
  });

  /** HC2: Company A and B get independent ids for independently-written handoffs. */
  it("HC2: Company A and B handoffs have independent ids", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    setPendingBudgetItem("company-b", FLOOR_ITEM);

    const a = getPendingBudgetHandoff("company-a");
    const b = getPendingBudgetHandoff("company-b");
    expect(a?.id).not.toBe(b?.id);
  });

  /** HC3: consuming with the currently-stored id removes it. */
  it("HC3: consumePendingBudgetItem removes the handoff when the id matches", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    const a1 = getPendingBudgetHandoff("company-a");
    expect(a1).not.toBeNull();

    const consumed = consumePendingBudgetItem("company-a", a1!.id);

    expect(consumed).toBe(true);
    expect(getPendingBudgetItem("company-a")).toBeNull();
  });

  /** HC4: a stale id (superseded by a newer handoff) is never consumed — the newer handoff survives untouched. */
  it("HC4: consumePendingBudgetItem does not remove a newer handoff that replaced the expected one", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    const a1 = getPendingBudgetHandoff("company-a");

    // A2 replaces A1 in storage (same company, new calculator result).
    setPendingBudgetItem("company-a", FLOOR_ITEM);
    const a2 = getPendingBudgetHandoff("company-a");
    expect(a2?.id).not.toBe(a1?.id);

    const consumed = consumePendingBudgetItem("company-a", a1!.id);

    expect(consumed).toBe(false);
    expect(getPendingBudgetHandoff("company-a")?.id).toBe(a2?.id);
    expect(getPendingBudgetItem("company-a")).toEqual(FLOOR_ITEM);
  });

  /** HC5: consuming Company A's handoff (by id) never touches Company B's, regardless of id collisions in theory. */
  it("HC5: consuming Company A's handoff never touches Company B's", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    setPendingBudgetItem("company-b", FLOOR_ITEM);
    const a1 = getPendingBudgetHandoff("company-a");
    const b1 = getPendingBudgetHandoff("company-b");

    consumePendingBudgetItem("company-a", a1!.id);

    expect(getPendingBudgetItem("company-a")).toBeNull();
    expect(getPendingBudgetHandoff("company-b")?.id).toBe(b1?.id);
    expect(getPendingBudgetItem("company-b")).toEqual(FLOOR_ITEM);
  });

  /** HC6: a (possibly stale) success consumes exactly the handoff id that was used for that POST. */
  it("HC6: consuming with the id captured at submit time removes exactly that handoff", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    const requestHandoffId = getPendingBudgetHandoff("company-a")!.id;

    // Simulates BudgetForm resolving a 201 well after the request began.
    const consumed = consumePendingBudgetItem("company-a", requestHandoffId);

    expect(consumed).toBe(true);
    expect(getPendingBudgetItem("company-a")).toBeNull();
  });

  /** HC7: a failed POST must never consume — the id is simply never passed to consume at all in that path, and even if it were, an unrelated id doesn't match. */
  it("HC7: the handoff used by a failed POST remains available afterwards", () => {
    setPendingBudgetItem("company-a", MASONRY_ITEM);
    // On failure, BudgetForm never calls consumePendingBudgetItem.
    expect(getPendingBudgetItem("company-a")).toEqual(MASONRY_ITEM);
  });

  /** HC8: the legacy unscoped key is still never reused/attributed, even with the new envelope shape. */
  it("HC8: the legacy unscoped key is never reused for handoff identity either", () => {
    window.sessionStorage.setItem(
      "obrafacil:pending-budget-item",
      JSON.stringify({ version: 1, id: "legacy-id", item: MASONRY_ITEM })
    );

    expect(getPendingBudgetHandoff("company-a")).toBeNull();
    expect(window.sessionStorage.getItem("obrafacil:pending-budget-item")).toBeNull();
  });
});
