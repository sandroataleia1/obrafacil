/**
 * §77 PROTOTYPE CLEANUP — the OLD prototype UI models for the Orçamentos
 * flow (name/customerName/projectReference/stages/marginPercentage/
 * proposalToken/projectId), moved out of `../types.ts` so that file can
 * become the real API contract (BUDGET-FRONTEND-01).
 *
 * `budget-store.ts`/`budget-totals.ts`/`budget.ts` (prototype domain
 * ops) still import from here — they remain the localStorage-backed
 * data source for modules OUTSIDE Orçamentos that this gate is
 * explicitly forbidden from touching (Projects, Customers' budget
 * history widget, Dashboard summary/executive panel, Project Costs,
 * Analytics, Backup/pilot-reset seeding). See the gate report for the
 * full consumer list. No `/orcamentos` or `/proposta` page may import
 * this file or its dependents.
 */

export type BudgetStatus = "draft" | "pending_approval" | "approved" | "rejected";

export interface CalculatedStageItem {
  materialName: string;
  quantity: number;
  unit: string;
}

export interface CalculatedBudgetStage {
  id: string;
  kind: "calculated";
  name: string;
  item: CalculatedStageItem;
  materialsCost: number;
  laborCost: number;
}

export interface ManualBudgetStage {
  id: string;
  kind: "manual";
  name: string;
  value: number;
}

export type BudgetStage = CalculatedBudgetStage | ManualBudgetStage;

export interface Budget {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  projectReference?: string;
  status: BudgetStatus;
  stages: BudgetStage[];
  marginPercentage: number;
  discountAmount: number;
  proposalToken: string;
  /** Set once a Project (Obra) has been created from this approved budget. */
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Recusado",
};
