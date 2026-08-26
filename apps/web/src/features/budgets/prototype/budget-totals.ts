/**
 * Prototype budget totals for UI validation only.
 *
 *   costTotal = materials + labor + manual stages + other costs
 *   total     = costTotal × (1 + margin / 100) − discount
 *
 * This is NOT the definitive commercial formula. It exists only to make
 * the Orçamentos prototype feel coherent end-to-end; the real pricing and
 * margin rules will be revisited once the Laravel Calculation/Pricing
 * Engine is implemented.
 */

import type { Budget, BudgetStage, CalculatedBudgetStage, ManualBudgetStage } from "../types";

export function isCalculatedStage(stage: BudgetStage): stage is CalculatedBudgetStage {
  return stage.kind === "calculated";
}

export function isManualStage(stage: BudgetStage): stage is ManualBudgetStage {
  return stage.kind === "manual";
}

export function stageBaseAmount(stage: BudgetStage): number {
  return isCalculatedStage(stage) ? stage.materialsCost + stage.laborCost : stage.value;
}

export interface BudgetTotals {
  materialsCost: number;
  laborCost: number;
  manualStagesTotal: number;
  otherCosts: number;
  costTotal: number;
  marginAmount: number;
  totalBeforeDiscount: number;
  total: number;
}

export function calculateBudgetTotals(
  budget: Pick<Budget, "stages" | "otherCosts" | "marginPercentage" | "discountAmount">
): BudgetTotals {
  const calculatedStages = budget.stages.filter(isCalculatedStage);
  const manualStages = budget.stages.filter(isManualStage);

  const materialsCost = calculatedStages.reduce((sum, stage) => sum + stage.materialsCost, 0);
  const laborCost = calculatedStages.reduce((sum, stage) => sum + stage.laborCost, 0);
  const manualStagesTotal = manualStages.reduce((sum, stage) => sum + stage.value, 0);

  const costTotal = materialsCost + laborCost + manualStagesTotal + budget.otherCosts;
  const marginAmount = costTotal * (budget.marginPercentage / 100);
  const totalBeforeDiscount = costTotal + marginAmount;
  const total = Math.max(totalBeforeDiscount - budget.discountAmount, 0);

  return {
    materialsCost,
    laborCost,
    manualStagesTotal,
    otherCosts: budget.otherCosts,
    costTotal,
    marginAmount,
    totalBeforeDiscount,
    total,
  };
}

export interface ProposalLine {
  id: string;
  name: string;
  amount: number;
}

/**
 * Line items shown to the client on the public proposal. Only the
 * marked-up sale amount per stage is exposed — the internal cost/labor
 * split and margin percentage are never shown to the customer.
 */
export function getProposalLines(budget: Budget): ProposalLine[] {
  const markup = 1 + budget.marginPercentage / 100;
  const lines: ProposalLine[] = budget.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    amount: stageBaseAmount(stage) * markup,
  }));

  if (budget.otherCosts > 0) {
    lines.push({
      id: "other-costs",
      name: "Outros custos",
      amount: budget.otherCosts * markup,
    });
  }

  return lines;
}
