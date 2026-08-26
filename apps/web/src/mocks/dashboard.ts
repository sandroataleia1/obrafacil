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
