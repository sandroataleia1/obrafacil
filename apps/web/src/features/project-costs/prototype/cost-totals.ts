import { PROJECT_COST_CATEGORIES, type ProjectCost, type ProjectCostCategory } from "../types";

export function sumCosts(costs: ProjectCost[]): number {
  return costs.reduce((total, cost) => total + cost.amount, 0);
}

export function sumCostsByCategory(
  costs: ProjectCost[]
): Array<{ category: ProjectCostCategory; total: number }> {
  return PROJECT_COST_CATEGORIES.map((category) => ({
    category,
    total: costs
      .filter((cost) => cost.category === category)
      .reduce((total, cost) => total + cost.amount, 0),
  })).filter((entry) => entry.total > 0);
}
