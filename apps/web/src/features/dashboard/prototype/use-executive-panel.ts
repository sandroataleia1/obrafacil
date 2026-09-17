"use client";

/**
 * Reads every store the executive panel needs and composes them via
 * `buildCompanyAnalyticsFacts`/`buildProjectAnalyticsFacts` (Demo-Ready
 * 010A) — no financial/team/materials formula lives here, only store
 * reads + calls to the analytics builders. Mirrors the existing
 * `use-dashboard-summary.ts` pattern exactly, but sourced from
 * `features/analytics/**` instead of `buildProjectManagementSummary`
 * directly (Demo-Ready 010B §2).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { listAllProjectsFromApi } from "@/features/projects/projects-client";
import { listAllPayables } from "@/features/payables/prototype/payable-store";
import { listAllReceivables } from "@/features/receivables/prototype/receivable-store";
import { listReceiptsByReceivable } from "@/features/receivables/prototype/receipt-store";
import { listAllProjectCosts, listCostsByProject } from "@/features/project-costs/prototype/project-cost-store";
import { listAllEmployees } from "@/features/employees/prototype/employee-store";
import { listAllWorkPeriods } from "@/features/employees/prototype/work-period-store";
import { listAllProjectTeamAssignments } from "@/features/projects/team/project-team-assignment-store";
import { listRequirementsByProject } from "@/features/materials/prototype/material-requirement-store";
import { listPurchaseOrdersByProject } from "@/features/purchases/prototype/purchase-order-store";
import { listItemsByPurchaseOrders } from "@/features/purchases/prototype/purchase-order-item-store";
import { listReceiptItemsByPurchaseOrder } from "@/features/purchases/prototype/goods-receipt-item-store";
import { listConsumptionsByProject } from "@/features/materials/prototype/material-consumption-store";

import { buildCompanyAnalyticsFacts } from "@/features/analytics/company-analytics";
import { buildProjectAnalyticsFacts } from "@/features/analytics/project-analytics";
import type { CompanyAnalyticsFacts, ProjectAnalyticsFacts } from "@/features/analytics/types";
import { todayIso } from "@/lib/date";
import type { ProjectListItem } from "@/features/projects/types";

export interface ExecutivePanelProjectEntry {
  project: ProjectListItem;
  facts: ProjectAnalyticsFacts;
}

export interface ExecutivePanelData {
  referenceDate: string;
  period: string;
  company: CompanyAnalyticsFacts;
  projectEntries: ExecutivePanelProjectEntry[];
}

async function loadExecutivePanelData(period: string): Promise<ExecutivePanelData> {
  const today = todayIso();
  const projects = await listAllProjectsFromApi();
  const payables = listAllPayables();
  const receivables = listAllReceivables();
  const receiptsFor = (receivableId: string) => listReceiptsByReceivable(receivableId);
  const projectCosts = listAllProjectCosts();
  const employees = listAllEmployees();
  const workPeriods = listAllWorkPeriods();
  const assignments = listAllProjectTeamAssignments();

  const company = buildCompanyAnalyticsFacts({
    projects,
    payables,
    receivables,
    receiptsFor,
    projectCosts,
    employees,
    assignments,
    workPeriods,
    referenceDate: today,
    workforcePeriod: period,
  });

  const projectEntries: ExecutivePanelProjectEntry[] = projects.map((project) => {
    // §44/§45: no legacy Budget prototype lookup — the real Project's
    // `source_budget` never exposes cost/margin (only {id, number,
    // total}, deliberately — ADR-016/PROJECT-API-01 §17), so
    // buildProjectAnalyticsFacts's cost-budget breakdown (budgetedCost/
    // budgetSaleTotal/budgetMarginAmount) has no legitimate source
    // anymore and stays null here, same principle as
    // `buildProjectManagementSummary`'s referenceAmount boundary.
    const costs = listCostsByProject(project.id);
    const purchaseOrders = listPurchaseOrdersByProject(project.id);
    const purchaseOrderItems = listItemsByPurchaseOrders(purchaseOrders.map((purchaseOrder) => purchaseOrder.id));
    const goodsReceiptItems = purchaseOrders.flatMap((purchaseOrder) =>
      listReceiptItemsByPurchaseOrder(purchaseOrder.id)
    );

    return {
      project,
      facts: buildProjectAnalyticsFacts({
        projectId: project.id,
        budget: null,
        costs,
        payables,
        receivables,
        receiptsFor,
        materialRequirements: listRequirementsByProject(project.id),
        purchaseOrders,
        purchaseOrderItems,
        goodsReceiptItems,
        materialConsumptions: listConsumptionsByProject(project.id),
      }),
    };
  });

  return { referenceDate: today, period, company, projectEntries };
}

interface LoadedExecutivePanel {
  companyId: string | undefined;
  data: ExecutivePanelData;
}

/**
 * FRONTEND-PROJECTS-01A §14: same tagged-state/live-ref/error-contract
 * discipline as `useAllProjects`/`useDashboardSummary` — `data` is
 * derived from a `{companyId, data}`-tagged state (never a bare value),
 * `activeCompanyIdRef` is written via `useLayoutEffect`, and a real
 * fetch failure surfaces as `error: true` rather than leaving `data`
 * permanently `undefined` with no feedback.
 */
export function useExecutivePanel(period: string): { data: ExecutivePanelData | undefined; error: boolean; reload: () => void } {
  const auth = useAuth();
  const activeCompanyId = auth.activeCompany?.id;

  const [loaded, setLoaded] = useState<LoadedExecutivePanel | null>(null);
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
    loadExecutivePanelData(period)
      .then((result) => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setLoaded({ companyId: requestCompanyId, data: result });
      })
      .catch(() => {
        if (requestSequence.current !== requestId) return;
        if (activeCompanyIdRef.current !== requestCompanyId) return;
        setErrorCompanyId(requestCompanyId);
      });
  }, [period, activeCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isCurrentTenant = loaded !== null && loaded.companyId === activeCompanyId;
  const data = isCurrentTenant ? loaded.data : undefined;
  const error = errorCompanyId === activeCompanyId;

  return { data, error, reload: load };
}
