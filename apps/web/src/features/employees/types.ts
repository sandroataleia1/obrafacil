/**
 * UI/prototype model for Equipe (Employee) and their monthly work
 * control (EmployeeWorkPeriod).
 *
 * `baseSalary` is a base value informed by the user to help estimate
 * the month — it does NOT represent a complete legal payroll figure
 * (no INSS, FGTS, IRRF, DSR, férias, 13º, benefícios, horas extras,
 * etc.). See `prototype/period-calculation.ts` for the estimate
 * formula and its own disclaimer.
 *
 * An Employee is intentionally NOT tied to a single Project — a
 * future version may allow working across multiple projects
 * (allocation), which is why there is no `projectId` here.
 *
 * Future finance integration (not built yet): a closed employee
 * period may produce a Payable; that Payable, once paid, may produce
 * a labor ProjectCost. No `payableId`/`projectCostId` is modeled here
 * ahead of that need.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export type EmployeeStatus = "active" | "inactive";

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone?: string;
  baseSalary: number;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

/**
 * Monthly work control for one employee. `period` is a plain
 * "YYYY-MM" string — it never needs to become a `Date` for this
 * screen, avoiding timezone conversions entirely.
 *
 * `baseSalarySnapshot` freezes the base salary used at the time this
 * period was created, so editing the employee's current base salary
 * later never changes past periods' calculations.
 *
 * `manualAdjustment` is signed (negative = desconto, positive =
 * acréscimo); the UI never asks for a signed monetary input directly
 * (see the adjustment type control in `period-detail.tsx`).
 *
 * Status ("Em aberto" / "Fechado") is derived from `closedAt`, never
 * stored redundantly, and is an operational state only — it does NOT
 * mean "Pago".
 */
export interface EmployeeWorkPeriod {
  id: string;
  employeeId: string;
  period: string;
  expectedDays: number;
  workedDays: number;
  baseSalarySnapshot: number;
  manualAdjustment: number;
  notes?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkPeriodStatus = "open" | "closed";

export const WORK_PERIOD_STATUS_LABEL: Record<WorkPeriodStatus, string> = {
  open: "Em aberto",
  closed: "Fechado",
};

export function getWorkPeriodStatus(workPeriod: EmployeeWorkPeriod): WorkPeriodStatus {
  return workPeriod.closedAt ? "closed" : "open";
}

/**
 * How a closed period's estimated pay is apportioned to a Project
 * (Obra) as a realized labor cost — a separate concern from Payable
 * (the financial obligation to the employee). Both hang off the same
 * `EmployeeWorkPeriod`, independently:
 *
 *   EmployeeWorkPeriod (Fechado)
 *       ├── Payable                        — obrigação financeira
 *       └── EmployeePeriodAllocation[]      — custo apropriado à Obra
 *
 * `employeeId`/`period`/`year`/`month` are intentionally NOT stored
 * here — they are always resolved by looking up `employeePeriodId`,
 * mirroring how `Payable.originId` never duplicates the employee
 * identity either. There is also no `payableId`/`projectCostId` link:
 * an allocation's materialized ProjectCost is found the same way
 * everything else in this codebase resolves provenance — by
 * `originType`/`originId` lookup (see `features/project-costs`).
 *
 * One allocation per (employeePeriodId, projectId) pair. A period may
 * be split across multiple projects, and partial allocation (money
 * left "não alocado") is expected and valid — 100% allocation is not
 * required.
 */
export interface EmployeePeriodAllocation {
  id: string;
  employeePeriodId: string;
  projectId: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}
