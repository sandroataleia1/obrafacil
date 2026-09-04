"use client";

import { useEffect, useState } from "react";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjectCosts } from "@/features/project-costs/prototype/project-cost-store";
import { listAllPayables } from "@/features/payables/prototype/payable-store";
import { listAllReceivables } from "@/features/receivables/prototype/receivable-store";
import { listReceiptsByReceivable } from "@/features/receivables/prototype/receipt-store";
import { buildDashboardSummary, type DashboardSummary } from "./dashboard-summary";

/**
 * Reads every store the Dashboard needs and composes them via
 * `buildDashboardSummary` — no financial formula lives here, only
 * store reads + one call to the pure helper. `undefined` while
 * loading (post-mount hydration, same pattern as `useProject`/
 * `useBudget`), then the derived summary.
 */
export function useDashboardSummary(): DashboardSummary | undefined {
  const [summary, setSummary] = useState<DashboardSummary | undefined>(undefined);

  useEffect(() => {
    const projects = listAllProjects();
    const budgets = listAllBudgets();
    const costs = listAllProjectCosts();
    const payables = listAllPayables();
    const receivables = listAllReceivables();
    const receipts = receivables.flatMap((receivable) => listReceiptsByReceivable(receivable.id));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary(
      buildDashboardSummary({ projects, budgets, costs, payables, receivables, receipts })
    );
  }, []);

  return summary;
}
