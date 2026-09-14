/**
 * §6 CALCULATOR handoff adapter — converts a `PendingBudgetItem` (the
 * sessionStorage handoff produced by a Calculator screen) into the real
 * `BudgetItemCreatePayload` sent to POST /budgets.
 *
 * v1 rule (verbatim from spec §6): `source_type="calculator"`,
 * `calculator_type = pending.source`, `name = pending.title`,
 * `quantity = "1.000"`, `unit = null`, `unit_cost = null`,
 * `line_discount = "0.00"`, `calculation_snapshot` = the full RAW
 * pending item object. `unit_price` is filled explicitly by the user —
 * never derived from mock pricing (§5/§75).
 *
 * The technical calculation stays fully auditable in the snapshot, but
 * we never pretend bricks/boxes/bars/m³ are automatically the
 * commercial unit of the proposal — the commercial line starts as a
 * closed price for that service/scope.
 */

import type { PendingBudgetItem } from "../prototype/pending-budget-item";
import type { BudgetItemCreatePayload } from "../types";

export function calculatorItemToBudgetItemPayload(
  pending: PendingBudgetItem,
  unitPrice: string
): BudgetItemCreatePayload {
  return {
    source_type: "calculator",
    calculator_type: pending.source,
    name: pending.title,
    quantity: "1.000",
    unit: null,
    unit_price: unitPrice,
    unit_cost: null,
    line_discount: "0.00",
    calculation_snapshot: pending as unknown as Record<string, unknown>,
  };
}
