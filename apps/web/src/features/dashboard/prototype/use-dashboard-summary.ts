"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjectCosts } from "@/features/project-costs/prototype/project-cost-store";
import { listAllPayables } from "@/features/payables/prototype/payable-store";
import { listAllReceivables } from "@/features/receivables/prototype/receivable-store";
import { listReceiptsByReceivable } from "@/features/receivables/prototype/receipt-store";
import { buildDashboardSummary, type DashboardSummary } from "./dashboard-summary";

interface LoadedSummary {
  companyId: string | undefined;
  summary: DashboardSummary;
}

/**
 * Reads every store the Dashboard needs and composes them via
 * `buildDashboardSummary` — no financial formula lives here. Projects
 * now come from the real API (§49) via `listAllProjectsFromApi()`, so
 * this hook is async and company-guarded (mirrors `useAllProjects`);
 * every other store here is still a synchronous prototype read.
 *
 * FRONTEND-PROJECTS-01A §13 hardening: `summary` is derived from a
 * `{companyId, summary}`-tagged state, never a bare value — a Company
 * switch hides A's summary in the SAME render, not one effect-tick
 * later. `activeCompanyIdRef` is written via `useLayoutEffect` so a
 * microtask-resolved `listAllProjectsFromApi()` continuation for the OLD
 * company can never mistake itself for current. A real fetch failure
 * surfaces as `error: true` — it is NEVER collapsed into an
 * all-zeros/empty summary, which would misrepresent "the API is down"
 * as "this Company has no data".
 */
export function useDashboardSummary(): { summary: DashboardSummary | undefined; error: boolean; reload: () => void } {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedSummary | null>(null);
  const [errorCompanyId, setErrorCompanyId] = useState<string | undefined>(undefined);

  const requestSequence = useRef(0);
  const activeCompanyIdRef = useRef(activeCompanyId);
  useLayoutEffect(() => {
    activeCompanyIdRef.current = activeCompanyId;
  }, [activeCompanyId]);

  const load = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestCompanyId = activeCompanyId;
    setErrorCompanyId(undefined);

    listAllProjectsFromApi()
      .then((projects) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;

        const budgets = listAllBudgets();
        const costs = listAllProjectCosts();
        const payables = listAllPayables();
        const receivables = listAllReceivables();
        const receipts = receivables.flatMap((receivable) => listReceiptsByReceivable(receivable.id));

        setLoaded({
          companyId: requestCompanyId,
          summary: buildDashboardSummary({ projects, budgets, costs, payables, receivables, receipts }),
        });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorCompanyId(requestCompanyId);
      });
  }, [activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId;
  const summary = isCurrentTenant ? loaded.summary : undefined;
  const error = errorCompanyId === activeCompanyId;

  return { summary, error, reload: load };
}
