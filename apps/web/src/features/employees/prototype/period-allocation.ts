/**
 * Bridges a closed EmployeeWorkPeriod's estimated pay to Contas de
 * Obra (ProjectCost) via EmployeePeriodAllocation. This is a
 * completely separate concern from `period-payable.ts` — allocating
 * labor cost to a Project and paying the employee are independent
 * cycles that both hang off the same EmployeeWorkPeriod:
 *
 *   EmployeeWorkPeriod (Fechado)
 *       ├── Payable                        — obrigação financeira
 *       └── EmployeePeriodAllocation[]      — custo apropriado à Obra
 *
 * An Allocation is the source of truth; its materialized ProjectCost
 * is a projection kept in sync here so every existing "custo da obra"
 * total already picks it up with zero changes elsewhere. Creating,
 * editing or deleting an Allocation immediately creates/updates/
 * deletes exactly one ProjectCost — this never depends on whether a
 * Payable exists, or on its status. Marking the Payable paid, undoing
 * that payment, or deleting the Payable must never touch an
 * Allocation or its ProjectCost (see `period-payable.ts`, which is
 * intentionally untouched by this module and vice versa).
 */

import { formatCurrency, toCents } from "@/lib/currency";
import { todayIso } from "@/lib/date";
import { getProject } from "@/features/projects/prototype/project-store";
import {
  createProjectCostId,
  deleteProjectCostByOrigin,
  findProjectCostByOrigin,
  saveProjectCost,
} from "@/features/project-costs/prototype/project-cost-store";
import { calculatePeriodEstimate } from "./period-calculation";
import { formatPeriodShort, lastDayOfPeriod } from "./period-label";
import {
  createAllocationId,
  deleteAllocation,
  findAllocation,
  getAllocation,
  listAllocationsForPeriod,
  saveAllocation,
} from "./period-allocation-store";
import { getWorkPeriod } from "./work-period-store";
import { getWorkPeriodStatus, type Employee, type EmployeePeriodAllocation, type EmployeeWorkPeriod } from "../types";

export type AllocationResult =
  | { ok: true; allocation: EmployeePeriodAllocation }
  | { ok: false; error: string };

export interface AllocationSummary {
  expected: number;
  allocated: number;
  remaining: number;
}

function centsAllocatedExcluding(employeePeriodId: string, excludeAllocationId: string | null): number {
  return listAllocationsForPeriod(employeePeriodId)
    .filter((allocation) => allocation.id !== excludeAllocationId)
    .reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
}

export function summarizeAllocations(workPeriod: EmployeeWorkPeriod): AllocationSummary {
  const expected = calculatePeriodEstimate(workPeriod).estimatedPay;
  const expectedCents = toCents(expected);
  const allocatedCents = centsAllocatedExcluding(workPeriod.id, null);
  const remainingCents = Math.max(expectedCents - allocatedCents, 0);
  return {
    expected,
    allocated: allocatedCents / 100,
    remaining: remainingCents / 100,
  };
}

function materializeProjectCost(
  allocation: EmployeePeriodAllocation,
  workPeriod: EmployeeWorkPeriod,
  employee: Employee
): void {
  const existing = findProjectCostByOrigin("employee-period-allocation", allocation.id);
  const now = todayIso();
  saveProjectCost({
    id: existing?.id ?? createProjectCostId(),
    projectId: allocation.projectId,
    date: lastDayOfPeriod(workPeriod.period),
    category: "labor",
    description: `${employee.name} · ${formatPeriodShort(workPeriod.period)}`,
    amount: allocation.amount,
    originType: "employee-period-allocation",
    originId: allocation.id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

function validateAmount(
  workPeriod: EmployeeWorkPeriod,
  amount: number,
  excludeAllocationId: string | null
): string | null {
  if (getWorkPeriodStatus(workPeriod) !== "closed") {
    return "O período precisa estar fechado para alocar custos em obras.";
  }
  if (!(amount > 0)) {
    return "Informe um valor maior que zero.";
  }

  const expectedCents = toCents(calculatePeriodEstimate(workPeriod).estimatedPay);
  const otherAllocatedCents = centsAllocatedExcluding(workPeriod.id, excludeAllocationId);
  const amountCents = toCents(amount);

  if (otherAllocatedCents + amountCents > expectedCents) {
    const availableReais = Math.max(expectedCents - otherAllocatedCents, 0) / 100;
    return `Valor maior que o saldo disponível de ${formatCurrency(availableReais)}.`;
  }

  return null;
}

export function allocatePeriodToProject(
  workPeriod: EmployeeWorkPeriod,
  employee: Employee,
  projectId: string,
  amount: number
): AllocationResult {
  if (!getProject(projectId)) {
    return { ok: false, error: "Obra não encontrada." };
  }
  if (findAllocation(workPeriod.id, projectId)) {
    return {
      ok: false,
      error: "Esta obra já possui uma alocação neste período. Edite a alocação existente.",
    };
  }

  const error = validateAmount(workPeriod, amount, null);
  if (error) return { ok: false, error };

  const now = todayIso();
  const allocation: EmployeePeriodAllocation = {
    id: createAllocationId(),
    employeePeriodId: workPeriod.id,
    projectId,
    amount,
    createdAt: now,
    updatedAt: now,
  };
  saveAllocation(allocation);
  materializeProjectCost(allocation, workPeriod, employee);
  return { ok: true, allocation };
}

/**
 * Edits an allocation's amount only — the project stays fixed. This
 * is a deliberate simplification: allowing the project itself to
 * change on edit would need to re-validate uniqueness against a
 * different (employeePeriodId, projectId) pair and risks a silent
 * merge with an existing allocation for the target project. Changing
 * which project an allocation belongs to is done by deleting it and
 * creating a new one instead.
 */
export function updatePeriodAllocation(
  allocation: EmployeePeriodAllocation,
  workPeriod: EmployeeWorkPeriod,
  employee: Employee,
  amount: number
): AllocationResult {
  const error = validateAmount(workPeriod, amount, allocation.id);
  if (error) return { ok: false, error };

  const updated: EmployeePeriodAllocation = { ...allocation, amount, updatedAt: todayIso() };
  saveAllocation(updated);
  materializeProjectCost(updated, workPeriod, employee);
  return { ok: true, allocation: updated };
}

export function removePeriodAllocation(allocation: EmployeePeriodAllocation): void {
  deleteAllocation(allocation.id);
  deleteProjectCostByOrigin("employee-period-allocation", allocation.id);
}

/**
 * Resolves the `/equipe/[id]/periodos/[period]` route for a given
 * allocation id — used by the Custos da Obra screen to redirect a
 * derived ProjectCost back to its source instead of offering a manual
 * edit form. Reused instead of duplicating the lookup in cost-list.tsx
 * and cost-form.tsx.
 */
export function resolveAllocationPeriodRoute(allocationId: string): string | null {
  const allocation = getAllocation(allocationId);
  if (!allocation) return null;
  const workPeriod = getWorkPeriod(allocation.employeePeriodId);
  if (!workPeriod) return null;
  return `/equipe/${workPeriod.employeeId}/periodos/${workPeriod.period}`;
}
