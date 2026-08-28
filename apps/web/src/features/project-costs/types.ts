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
 * A ProjectCost produced by marking a Payable (conta a pagar) as paid
 * carries `originType: "payable"` and `originId` pointing at that
 * Payable, so the integration can guarantee a Payable never produces
 * more than one ProjectCost (see `features/payables`).
 *
 * Future relations (documented, not modeled yet):
 * - Future employee/work-log payroll calculations may generate project
 *   costs in the "labor" category. No Employee/WorkLog/salary concept
 *   exists yet.
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

export type ProjectCostOriginType = "payable";

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
