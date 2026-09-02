export type KeyMetricKind = "orcado" | "gasto" | "a-receber" | "a-pagar";

export interface KeyMetric {
  id: string;
  kind: KeyMetricKind;
  label: string;
  value: number;
  helper: string;
}

export interface OperationalSummary {
  budgetsInProgress: number;
  budgetsAwaitingApproval: number;
  projectsInProgress: number;
  projectsActive: number;
}

export type ActivityKind = "budget" | "project";

export interface RecentActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
}

export const keyMetrics: KeyMetric[] = [
  {
    id: "metric-orcado",
    kind: "orcado",
    label: "Total orçado",
    value: 128500,
    helper: "3 obras ativas",
  },
  {
    id: "metric-gasto",
    kind: "gasto",
    label: "Gasto até agora",
    value: 42300,
    helper: "33% do orçado",
  },
  {
    id: "metric-a-receber",
    kind: "a-receber",
    label: "A receber",
    value: 18900,
    helper: "próximos 30 dias",
  },
  {
    id: "metric-a-pagar",
    kind: "a-pagar",
    label: "A pagar",
    value: 9750,
    helper: "próximos 30 dias",
  },
];

export const operationalSummary: OperationalSummary = {
  budgetsInProgress: 3,
  budgetsAwaitingApproval: 1,
  projectsInProgress: 2,
  projectsActive: 2,
};

export const recentActivity: RecentActivityItem[] = [
  {
    id: "budget-casa-oliveira",
    kind: "budget",
    title: "Orçamento Casa Oliveira",
    description: "Atualizado hoje",
  },
  {
    id: "project-reforma-centro",
    kind: "project",
    title: "Reforma Apartamento Centro",
    description: "Orçamento enviado ontem",
  },
  {
    id: "budget-edicula-fundos",
    kind: "budget",
    title: "Orçamento Edícula Fundos",
    description: "Criado há 3 dias",
  },
];
