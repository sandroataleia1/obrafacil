import { beforeEach, describe, expect, it } from "vitest";

import {
  calculateAvailableQuantity,
  isTimelineValid,
  listLedgerEventsForProjectMaterial,
  registerMaterialConsumption,
} from "../material-consumption";
import type { ReceivedEvent } from "@/features/purchases/purchase-received-events";

const PROJECT_ID = "proj-1";
const MATERIAL_ID = "mat-1";

function received(overrides: Partial<ReceivedEvent> = {}): ReceivedEvent {
  return {
    goodsReceiptId: "gr-1",
    projectId: PROJECT_ID,
    materialId: MATERIAL_ID,
    date: "2026-09-10",
    units: 5000,
    ...overrides,
  };
}

/**
 * SUPPLY-FRONTEND-01C1 §4/§8. `material-consumption.ts` no longer reads
 * any local mirror for physical-arrival facts — every function here
 * takes `receivedEvents` as a plain parameter and does zero I/O of its
 * own. These prove the ledger math still works correctly when driven
 * entirely by a caller-supplied array (as it would be from a real
 * `purchaseOrdersToReceivedEvents(orders)` call).
 */
describe("material-consumption — SUPPLY-FRONTEND-01C1", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("calculateAvailableQuantity reflects exactly the passed receivedEvents, nothing self-fetched", () => {
    expect(calculateAvailableQuantity(PROJECT_ID, MATERIAL_ID, [received({ units: 5000 })])).toBe(5);
    expect(calculateAvailableQuantity(PROJECT_ID, MATERIAL_ID, [])).toBe(0);
  });

  it("calculateAvailableQuantity scopes receivedEvents by projectId/materialId — a different pair never contributes", () => {
    const events = [received({ projectId: "proj-2", units: 9000 }), received({ materialId: "mat-2", units: 9000 })];
    expect(calculateAvailableQuantity(PROJECT_ID, MATERIAL_ID, events)).toBe(0);
  });

  it("listLedgerEventsForProjectMaterial includes the received event as a positive, dated entry", () => {
    const ledger = listLedgerEventsForProjectMaterial(PROJECT_ID, MATERIAL_ID, [received({ date: "2026-09-10", units: 5000 })]);
    expect(ledger).toContainEqual({ date: "2026-09-10", units: 5000 });
    expect(isTimelineValid(ledger)).toBe(true);
  });

  it("registerMaterialConsumption succeeds when the passed receivedEvents cover the requested quantity", () => {
    const result = registerMaterialConsumption(
      { projectId: PROJECT_ID, materialId: MATERIAL_ID, quantity: 3, consumedAt: "2026-09-11" },
      true,
      [received({ date: "2026-09-10", units: 5000 })]
    );
    expect(result.ok).toBe(true);
  });

  it("registerMaterialConsumption fails when receivedEvents is empty — never assumes availability", () => {
    const result = registerMaterialConsumption(
      { projectId: PROJECT_ID, materialId: MATERIAL_ID, quantity: 3, consumedAt: "2026-09-11" },
      true,
      []
    );
    expect(result.ok).toBe(false);
  });

  it("registerMaterialConsumption fails when consuming before the received event's own date (chronology, not just total)", () => {
    const result = registerMaterialConsumption(
      { projectId: PROJECT_ID, materialId: MATERIAL_ID, quantity: 3, consumedAt: "2026-09-05" },
      true,
      [received({ date: "2026-09-10", units: 5000 })]
    );
    expect(result.ok).toBe(false);
  });
});
