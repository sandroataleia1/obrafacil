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

/**
 * Vínculo (who the person is to the company) — separate from
 * `PaymentModel` (how they are paid). V1 only operates the
 * "employee + monthly" and "contractor + daily" combinations, but the
 * two axes are independent on purpose so a future combination (e.g. a
 * monthly contractor) never requires a type redesign.
 */
export type EmploymentType = "employee" | "contractor";

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: "Funcionário",
  contractor: "Prestador",
};

export type PaymentModel = "monthly" | "daily";

export const PAYMENT_MODEL_LABEL: Record<PaymentModel, string> = {
  monthly: "Mensal",
  daily: "Diária",
};

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone?: string;
  employmentType: EmploymentType;
  paymentModel: PaymentModel;
  /** Meaningful only when `paymentModel === "monthly"`; `0` when `"daily"` (never a placeholder value like 1). */
  baseSalary: number;
  /** Set only when `paymentModel === "daily"`. */
  dailyRate?: number;
  /** ISO weekday numbers (1=segunda ... 7=domingo). Set only when `paymentModel === "monthly"` — not used as a mandatory agenda for a daily contractor in V1. */
  workDays?: number[];
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

/** What actually happened on a given calendar day. Never conflated with whether the day was scheduled to be worked — see `DerivedDayStatus`/`buildPeriodAttendanceSummary` in `prototype/attendance.ts`. */
export type AttendanceStatus = "full_day" | "half_day" | "absent";

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  full_day: "Dia completo",
  half_day: "Meio período",
  absent: "Falta",
};

/**
 * A day is only recorded here when an explicit apontamento exists.
 * Absence of an entry never means "falta" — see
 * `prototype/attendance.ts` for how a day's effective status is
 * derived (UNRECORDED vs SCHEDULED_DAY_OFF vs an explicit status).
 */
export interface EmployeeAttendanceEntry {
  date: string;
  status: AttendanceStatus;
  note?: string;
}

/** A day's effective status once "previsto" (scale) and "realizado" (attendance entry) are combined. */
export type DerivedDayStatus = AttendanceStatus | "unrecorded" | "scheduled_day_off";

export const DERIVED_DAY_STATUS_LABEL: Record<DerivedDayStatus, string> = {
  ...ATTENDANCE_STATUS_LABEL,
  unrecorded: "Não apontado",
  scheduled_day_off: "Folga prevista",
};

/**
 * Monthly work control for one employee. `period` is a plain
 * "YYYY-MM" string — it never needs to become a `Date` for this
 * screen, avoiding timezone conversions entirely.
 *
 * Two shapes coexist here:
 *
 * LEGACY (periods created before 008B): frequency is the two scalars
 * `expectedDays`/`workedDays`, and `attendanceEntries`/`*Snapshot`
 * (except `baseSalarySnapshot`) are absent. A period is legacy iff
 * `paymentModelSnapshot === undefined` — see `isLegacyWorkPeriod` in
 * `prototype/attendance.ts`. Legacy periods are never migrated or
 * recalculated with the V2 model: there is no reliable source to
 * reconstruct which specific dates were worked, so inventing daily
 * history for them would fabricate data that never existed.
 *
 * V2 (periods created from 008B on): frequency is `attendanceEntries`
 * (sparse — only explicit apontamentos are stored), and the
 * `*Snapshot` fields freeze the Employee's vínculo/remuneração/escala
 * at creation time, so editing the Employee later never changes a
 * past period's calculation (see the sentinel test in
 * `prototype/attendance.ts` docs).
 *
 * `manualAdjustment` is signed (negative = desconto, positive =
 * acréscimo); the UI never asks for a signed monetary input directly
 * (see the adjustment type control in `period-detail.tsx`). It stays
 * a generic ajuste (never inferred from attendance) — see
 * `prototype/period-calculation.ts`.
 *
 * Status ("Em aberto" / "Fechado") is derived from `closedAt`, never
 * stored redundantly, and is an operational state only — it does NOT
 * mean "Pago".
 */
export interface EmployeeWorkPeriod {
  id: string;
  employeeId: string;
  period: string;

  /** LEGACY ONLY. Absent on V2 periods — never read/written by V2 logic. */
  expectedDays?: number;
  /** LEGACY ONLY. Absent on V2 periods — never read/written by V2 logic. */
  workedDays?: number;

  /** V2 ONLY. Presence of this field is what makes a period V2 — see `isLegacyWorkPeriod`. */
  employmentTypeSnapshot?: EmploymentType;
  /** V2 ONLY. */
  paymentModelSnapshot?: PaymentModel;
  /** Legacy: the base salary used at creation time. V2 monthly: same. V2 daily: `0` (not applicable). */
  baseSalarySnapshot: number;
  /** V2 daily only. */
  dailyRateSnapshot?: number;
  /** V2 monthly only — ISO weekday numbers, frozen at period creation. */
  workDaysSnapshot?: number[];
  /** V2 ONLY. Sparse — a date only appears here once an explicit apontamento is made. Empty on a freshly created period, for both monthly and daily. */
  attendanceEntries?: EmployeeAttendanceEntry[];

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
