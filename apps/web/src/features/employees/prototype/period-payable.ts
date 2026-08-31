/**
 * Bridges a closed EmployeeWorkPeriod to Contas a Pagar. Closing a
 * period is an operational action; generating a Payable from it is a
 * separate, explicit financial action (see `period-detail.tsx`) —
 * closing never creates a Payable on its own.
 *
 * The generated Payable is a financial snapshot of the period's
 * estimated pay at generation time — it does not stay in sync with
 * the period afterwards. To change it, delete the Payable, reopen the
 * period, edit it, close it again, and generate a new Payable.
 *
 * Employee work allocation across projects is not modeled yet.
 * Workforce payables remain unassigned to projects (`projectId:
 * undefined`) until project allocation is implemented — the existing
 * "no project => no ProjectCost on payment" rule already covers this
 * correctly, so paying one never produces a ProjectCost.
 */

import { todayIso } from "@/lib/date";
import { findPayableByOrigin, createPayableId, savePayable } from "@/features/payables/prototype/payable-store";
import type { Payable } from "@/features/payables/types";
import { calculatePeriodEstimate } from "./period-calculation";
import { formatPeriodShort } from "./period-label";
import type { Employee, EmployeeWorkPeriod } from "../types";

export function findPayableForPeriod(workPeriod: EmployeeWorkPeriod): Payable | null {
  return findPayableByOrigin("employee-period", workPeriod.id);
}

export function generatePayableForPeriod(
  workPeriod: EmployeeWorkPeriod,
  employee: Employee,
  dueDate: string,
  notes?: string
): Payable {
  const existing = findPayableForPeriod(workPeriod);
  if (existing) return existing;

  const estimate = calculatePeriodEstimate(workPeriod);
  const now = todayIso();
  const payable: Payable = {
    id: createPayableId(),
    description: `Pagamento ${employee.name} — ${formatPeriodShort(workPeriod.period)}`,
    supplier: employee.name,
    amount: estimate.estimatedPay,
    category: "labor",
    dueDate,
    projectId: undefined,
    notes,
    originType: "employee-period",
    originId: workPeriod.id,
    createdAt: now,
    updatedAt: now,
  };

  savePayable(payable);
  return payable;
}
