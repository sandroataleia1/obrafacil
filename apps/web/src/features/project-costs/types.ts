/**
 * UI/prototype model for realized project costs (custos da obra).
 *
 * A ProjectCost represents money already spent/considered as a cost
 * against a Project — not a bill to be paid. There is intentionally no
 * due date, payment status, installment, recurrence, or bank account
 * here; those concepts belong to the future Contas a Pagar module.
 *
 * Origin: a ProjectCost created manually has no `originType`/`originId`
 * — absence of origin represents a manual entry in this prototype, no
 * migration needed for costs created before origin tracking existed.
 * Any ProjectCost WITH an `originType` is derived/materialized by
 * another module and is not editable/deletable from the manual Custos
 * da Obra screen — see `saveManualProjectCost`/`deleteManualProjectCost`
 * in `prototype/project-cost-store.ts`, which guard on "any known
 * origin", not on a specific origin value, so this rule automatically
 * covers every origin type below without needing a new guard each time
 * one is added.
 *
 * - `"payable"`: produced by marking a Payable (conta a pagar) as paid,
 *   `originId` points at that Payable — guarantees a Payable never
 *   produces more than one ProjectCost (see `features/payables`).
 * - `"employee-period-allocation"`: produced by an
 *   `EmployeePeriodAllocation` (see `features/employees`) — an
 *   EmployeeWorkPeriod's estimated pay apportioned to this Project as
 *   a realized labor cost, independent of whether/when the
 *   corresponding Payable is paid. `originId` points at the
 *   Allocation; exactly one ProjectCost per Allocation.
 *
 * Future relations (documented, not modeled yet):
 * - Future purchases may also generate ProjectCost entries once a
 *   Purchases module exists. No Purchase/PurchaseItem/Supplier entity
 *   is modeled here — "supplier" below is plain optional text.
 *
 * NOT the definitive domain contract for the future API — only exists
 * to validate the product experience with mocked/local data.
 */

export type ProjectCostCategory =
  | "materials"
  | "labor"
  | "services"
  | "equipment"
  | "transport"
  | "other";

export const PROJECT_COST_CATEGORIES: ProjectCostCategory[] = [
  "materials",
  "labor",
  "services",
  "equipment",
  "transport",
  "other",
];

export const PROJECT_COST_CATEGORY_LABEL: Record<ProjectCostCategory, string> = {
  materials: "Materiais",
  labor: "Mão de obra",
  services: "Serviços",
  equipment: "Equipamentos",
  transport: "Transporte",
  other: "Outros",
};

export type ProjectCostOriginType = "payable" | "employee-period-allocation";

export interface ProjectCost {
  id: string;
  projectId: string;
  date: string;
  category: ProjectCostCategory;
  description: string;
  amount: number;
  supplier?: string;
  notes?: string;
  originType?: ProjectCostOriginType;
  originId?: string;
  createdAt: string;
  updatedAt: string;
}
