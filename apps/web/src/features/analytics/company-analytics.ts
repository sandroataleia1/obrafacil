/**
 * Company-wide analytics facts (Demo-Ready 010A). Aggregates across
 * every Payable/Receivable/ProjectCost/Employee/ProjectTeamAssignment
 * without a per-project filter — used for a future executive/company
 * summary (010B), never for a single Obra (see `project-analytics.ts`
 * for that).
 *
 * `finance` (obrigações financeiras da empresa) and `projectCosts`
 * (custos já realizados nas obras) are kept as two separate top-level
 * groups on purpose — they are never summed into one "despesas" total,
 * since a paid Payable can already be the same economic event as a
 * ProjectCost (Demo-Ready 010A §19/§27; see the audit's dupla-contagem
 * table). `finance.pendingPayables`/`overduePayables` intentionally
 * include administrative Payables with no `projectId` — that is what
 * makes them company-wide rather than obra-scoped.
 *
 * Every builder takes already-loaded domain data as input — no store
 * reads, no writes, fully pure.
 */

import type { Project } from "@/features/projects/types";
import type { Payable } from "@/features/payables/types";
import type { Receipt, Receivable } from "@/features/receivables/types";
import type { ProjectCost } from "@/features/project-costs/types";
import type { Employee, EmployeeWorkPeriod } from "@/features/employees/types";
import type { ProjectTeamAssignment } from "@/features/projects/team/types";
import { sumCosts } from "@/features/project-costs/prototype/cost-totals";
import { aggregatePayables, aggregateReceivables } from "./financial-analytics";
import { buildTeamSnapshotFacts, buildWorkforcePeriodFacts } from "./team-analytics";
import { PROJECT_STATUS_TO_COUNT_KEY, type CompanyAnalyticsFacts, type ProjectStatusCounts } from "./types";

export function buildProjectStatusCounts(projects: Project[]): ProjectStatusCounts {
  const counts: ProjectStatusCounts = { planning: 0, inProgress: 0, paused: 0, completed: 0 };
  for (const project of projects) {
    counts[PROJECT_STATUS_TO_COUNT_KEY[project.status]] += 1;
  }
  return counts;
}

export function buildCompanyAnalyticsFacts(input: {
  projects: Project[];
  payables: Payable[];
  receivables: Receivable[];
  receiptsFor: (receivableId: string) => Receipt[];
  projectCosts: ProjectCost[];
  employees: Employee[];
  assignments: ProjectTeamAssignment[];
  workPeriods: EmployeeWorkPeriod[];
  referenceDate: string;
  workforcePeriod: string;
}): CompanyAnalyticsFacts {
  const payableTotals = aggregatePayables(input.payables);
  const receivableTotals = aggregateReceivables(input.receivables, input.receiptsFor);

  return {
    projects: buildProjectStatusCounts(input.projects),
    finance: {
      pendingPayables: payableTotals.pending,
      overduePayables: payableTotals.overdue,
      outstandingReceivables: receivableTotals.outstanding,
      overdueReceivables: receivableTotals.overdue,
      receivedRevenue: receivableTotals.received,
    },
    team: buildTeamSnapshotFacts(input.employees, input.assignments, input.referenceDate),
    workforcePeriod: buildWorkforcePeriodFacts(input.employees, input.workPeriods, input.workforcePeriod),
    projectCosts: {
      realizedProjectCosts: sumCosts(input.projectCosts),
    },
  };
}
