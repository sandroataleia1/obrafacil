/**
 * UI/prototype models for the Orçamentos flow.
 * These are NOT the definitive domain contract for the future API —
 * they only exist to validate the product experience with mocked data.
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
  otherCosts: number;
  marginPercentage: number;
  discountAmount: number;
  proposalToken: string;
  createdAt: string;
  updatedAt: string;
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  rejected: "Recusado",
};
