/**
 * Prototype browser persistence for Obras (Project).
 *
 * There is no backend yet, so created/edited projects are kept in
 * localStorage, layered on top of the seed data in `src/mocks/projects.ts`.
 * Laravel + PostgreSQL will replace this storage entirely once the real
 * API exists.
 */

import { projects as seedProjects } from "@/mocks/projects";
import type { Project } from "../types";

const STORAGE_KEY = "obrafacil:projects";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Project> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Project>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Project>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAllProjects(): Project[] {
  const stored = readStore();
  const merged = new Map<string, Project>();
  for (const project of seedProjects) merged.set(project.id, project);
  for (const project of Object.values(stored)) merged.set(project.id, project);
  return Array.from(merged.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function getProject(id: string): Project | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  return seedProjects.find((project) => project.id === id) ?? null;
}

export function listProjectsByCustomer(customerId: string): Project[] {
  return listAllProjects().filter((project) => project.customerId === customerId);
}

export function saveProject(project: Project): void {
  const store = readStore();
  store[project.id] = project;
  writeStore(store);
}

export function createProjectId(): string {
  return createId();
}
