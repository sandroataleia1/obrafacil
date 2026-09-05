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

import { useEffect, useState } from "react";

import { listAllProjects } from "@/features/projects/prototype/project-store";
import { getBudget } from "@/features/budgets/prototype/budget-store";
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
import type { Project } from "@/features/projects/types";

export interface ExecutivePanelProjectEntry {
  project: Project;
  facts: ProjectAnalyticsFacts;
}

export interface ExecutivePanelData {
  referenceDate: string;
  period: string;
  company: CompanyAnalyticsFacts;
  projectEntries: ExecutivePanelProjectEntry[];
}

function loadExecutivePanelData(period: string): ExecutivePanelData {
  const today = todayIso();
  const projects = listAllProjects();
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
    const budget = project.budgetId ? getBudget(project.budgetId) : null;
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
        budget,
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

export function useExecutivePanel(period: string): ExecutivePanelData | undefined {
  const [data, setData] = useState<ExecutivePanelData | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(loadExecutivePanelData(period));
  }, [period]);

  return data;
}
