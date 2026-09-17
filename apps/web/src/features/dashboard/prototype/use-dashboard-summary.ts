"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjectCosts } from "@/features/project-costs/prototype/project-cost-store";
import { listAllPayables } from "@/features/payables/prototype/payable-store";
import { listAllReceivables } from "@/features/receivables/prototype/receivable-store";
import { listReceiptsByReceivable } from "@/features/receivables/prototype/receipt-store";
import { buildDashboardSummary, type DashboardSummary } from "./dashboard-summary";

/**
 * Reads every store the Dashboard needs and composes them via
 * `buildDashboardSummary` — no financial formula lives here. Projects
 * now come from the real API (§49) via `listAllProjectsFromApi()`, so
 * this hook is async and company-guarded (mirrors `useAllProjects`);
 * every other store here is still a synchronous prototype read.
 * `undefined` while loading, then the derived summary.
 */
export function useDashboardSummary(): DashboardSummary | undefined {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [summary, setSummary] = useState<DashboardSummary | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary(undefined);

    listAllProjectsFromApi()
      .then((projects) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;

        const budgets = listAllBudgets();
        const costs = listAllProjectCosts();
        const payables = listAllPayables();
        const receivables = listAllReceivables();
        const receipts = receivables.flatMap((receivable) => listReceiptsByReceivable(receivable.id));

        setSummary(buildDashboardSummary({ projects, budgets, costs, payables, receivables, receipts }));
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setSummary(buildDashboardSummary({ projects: [], budgets: [], costs: [], payables: [], receivables: [], receipts: [] }));
      });
  }, [activeCompanyId]);

  return summary;
}
