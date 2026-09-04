import type { ProjectTeamAssignment } from "@/features/projects/team/types";

/**
 * Minimal seed set covering the product scenarios that matter for
 * Equipe da Obra (Demo-Ready 009D-B): a monthly employee active on one
 * obra, a daily contractor active on one obra, one ended assignment,
 * one employee simultaneously allocated to two different obras (valid
 * — overlap is only forbidden within the SAME obra), and one inactive
 * employee with a historical (ended) assignment.
 */
export const projectTeamAssignments: ProjectTeamAssignment[] = [
  {
    id: "assignment-joao-edicula",
    projectId: "edicula-fundos-obra",
    employeeId: "joao-pereira",
    startDate: "2026-08-01",
    createdAt: "2026-08-01",
    updatedAt: "2026-08-01",
  },
  {
    id: "assignment-vinicius-deck",
    projectId: "deck-madeira-costa-obra",
    employeeId: "vinicius-prado",
    startDate: "2026-08-05",
    createdAt: "2026-08-05",
    updatedAt: "2026-08-05",
  },
  {
    id: "assignment-carlos-cozinha-encerrado",
    projectId: "reforma-cozinha-martins",
    employeeId: "carlos-santos",
    startDate: "2026-07-01",
    endDate: "2026-08-15",
    createdAt: "2026-07-01",
    updatedAt: "2026-08-15",
  },
  {
    id: "assignment-leandro-edicula",
    projectId: "edicula-fundos-obra",
    employeeId: "leandro-costa",
    startDate: "2026-08-01",
    createdAt: "2026-08-01",
    updatedAt: "2026-08-01",
  },
  {
    id: "assignment-leandro-cobertura",
    projectId: "cobertura-garagem-pinto-obra",
    employeeId: "leandro-costa",
    startDate: "2026-08-15",
    createdAt: "2026-08-15",
    updatedAt: "2026-08-15",
  },
  {
    id: "assignment-andre-banheiro-historico",
    projectId: "reforma-banheiro-almeida-obra",
    employeeId: "andre-lima",
    startDate: "2026-06-15",
    endDate: "2026-07-31",
    createdAt: "2026-06-15",
    updatedAt: "2026-07-31",
  },
];
