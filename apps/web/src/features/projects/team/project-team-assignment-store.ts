/**
 * Prototype browser persistence for ProjectTeamAssignment.
 *
 * There is no backend yet, so created/edited assignments are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/project-team-assignments.ts`. Laravel + PostgreSQL will
 * replace this storage entirely once the real API exists.
 *
 * No delete is exported: "Encerrar alocação" (setting `endDate`) is
 * the only supported way to end a vínculo, preserving history — see
 * `project-team.ts`.
 */

import { projectTeamAssignments as seedAssignments } from "@/mocks/project-team-assignments";
import type { ProjectTeamAssignment } from "./types";

const STORAGE_KEY = "obrafacil:project-team-assignments";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-team-assignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, ProjectTeamAssignment> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProjectTeamAssignment>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ProjectTeamAssignment>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAllProjectTeamAssignments(): ProjectTeamAssignment[] {
  const stored = readStore();
  const merged = new Map<string, ProjectTeamAssignment>();
  for (const assignment of seedAssignments) merged.set(assignment.id, assignment);
  for (const assignment of Object.values(stored)) merged.set(assignment.id, assignment);
  return Array.from(merged.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function listAssignmentsByProject(projectId: string): ProjectTeamAssignment[] {
  return listAllProjectTeamAssignments().filter((assignment) => assignment.projectId === projectId);
}

export function listAssignmentsByEmployee(employeeId: string): ProjectTeamAssignment[] {
  return listAllProjectTeamAssignments().filter((assignment) => assignment.employeeId === employeeId);
}

export function getProjectTeamAssignment(id: string): ProjectTeamAssignment | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  return seedAssignments.find((assignment) => assignment.id === id) ?? null;
}

export function saveProjectTeamAssignment(assignment: ProjectTeamAssignment): void {
  const store = readStore();
  store[assignment.id] = assignment;
  writeStore(store);
}

export function createProjectTeamAssignmentId(): string {
  return createId();
}
