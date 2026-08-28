/**
 * Prototype browser persistence for realized project costs (custos da obra).
 *
 * There is no backend yet, so created/edited/removed costs are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/project-costs.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 */

import { projectCosts as seedProjectCosts } from "@/mocks/project-costs";
import type { ProjectCost, ProjectCostOriginType } from "../types";

const STORAGE_KEY = "obrafacil:project-costs";
const DELETED_KEY = "obrafacil:project-costs:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, ProjectCost> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProjectCost>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ProjectCost>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function readDeleted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeDeleted(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(ids)));
}

function sortByDateDesc(a: ProjectCost, b: ProjectCost): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

export function listAllProjectCosts(): ProjectCost[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, ProjectCost>();
  for (const cost of seedProjectCosts) {
    if (!deleted.has(cost.id)) merged.set(cost.id, cost);
  }
  for (const cost of Object.values(stored)) {
    if (!deleted.has(cost.id)) merged.set(cost.id, cost);
  }
  return Array.from(merged.values()).sort(sortByDateDesc);
}

export function listCostsByProject(projectId: string): ProjectCost[] {
  return listAllProjectCosts().filter((cost) => cost.projectId === projectId);
}

export function findProjectCostByOrigin(
  originType: ProjectCostOriginType,
  originId: string
): ProjectCost | null {
  return (
    listAllProjectCosts().find(
      (cost) => cost.originType === originType && cost.originId === originId
    ) ?? null
  );
}

export function getProjectCost(id: string): ProjectCost | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedProjectCosts.find((cost) => cost.id === id) ?? null;
}

export function saveProjectCost(cost: ProjectCost): void {
  const store = readStore();
  store[cost.id] = cost;
  writeStore(store);
}

export function deleteProjectCost(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function deleteProjectCostByOrigin(
  originType: ProjectCostOriginType,
  originId: string
): void {
  const existing = findProjectCostByOrigin(originType, originId);
  if (existing) deleteProjectCost(existing.id);
}

/**
 * Guarded entry points for the manual "Custos da obra" screen. A cost
 * produced by a Payable (originType "payable") is owned by Contas a
 * Pagar — it must not be edited or removed from here. These wrappers
 * no-op (return false) instead of touching such a record; the manual
 * form should never reach them for a payable-origin cost (it redirects
 * away first), but the guard stays here too so the rule holds even if
 * a future caller forgets that check.
 */
export function saveManualProjectCost(cost: ProjectCost): boolean {
  const existing = getProjectCost(cost.id);
  if (existing?.originType === "payable") return false;
  saveProjectCost(cost);
  return true;
}

export function deleteManualProjectCost(id: string): boolean {
  const existing = getProjectCost(id);
  if (existing?.originType === "payable") return false;
  deleteProjectCost(id);
  return true;
}

export function createProjectCostId(): string {
  return createId();
}
