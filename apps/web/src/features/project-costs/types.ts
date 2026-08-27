/**
 * UI/prototype model for realized project costs (custos da obra).
 *
 * A ProjectCost represents money already spent/considered as a cost
 * against a Project — not a bill to be paid. There is intentionally no
 * due date, payment status, installment, recurrence, or bank account
 * here; those concepts belong to the future Contas a Pagar module.
 *
 * Future relations (documented, not modeled yet):
 * - Future payables may produce or settle ProjectCost entries. This
 *   prototype records realized project costs only.
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

export interface ProjectCost {
  id: string;
  projectId: string;
  date: string;
  category: ProjectCostCategory;
  description: string;
  amount: number;
  supplier?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
