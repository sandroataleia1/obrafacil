/**
 * UI/prototype model for Obras (Project). NOT the definitive domain
 * contract for the future API — only exists to validate the product
 * experience with mocked/local data.
 *
 * Intentionally does NOT include arrays/relations for future modules
 * (expenses, payables, employees, work logs, financial entries). Those
 * relations will be modeled when those modules actually exist — adding
 * empty placeholders now would be architecture built ahead of need.
 */

export type ProjectStatus = "planning" | "in_progress" | "paused" | "completed";

export interface Project {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  reference?: string;
  address?: string;
  status: ProjectStatus;
  budgetId?: string;
  expectedStartDate?: string;
  /** Date-only. Optional — no default, no auto-computed schedule. Used
   * only to derive lateness (see `project-schedule.ts`); not a
   * cronograma/milestone system. */
  expectedEndDate?: string;
  createdAt: string;
  updatedAt: string;
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
};
