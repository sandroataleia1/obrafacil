/**
 * SUPPLY-FRONTEND-01B — MaterialRequirement itself is now the real API
 * domain (`features/materials/material-requirements-client.ts`). This
 * store survives ONLY as the transitional data source for the OUT-OF-
 * SCOPE local consumers listed in `./legacy-types.ts`'s doc comment
 * (Dashboard executive panel, Obra detail widget, Analytics, Stock
 * supply-metrics) — see that file for the full rationale. No migrated
 * Requirement screen may import this module.
 */

import { materialRequirements as seedRequirements } from "@/mocks/material-requirements";
import { demoDataEnabled } from "@/lib/pilot-config";
import type { LegacyMaterialRequirement as MaterialRequirement } from "./legacy-types";

const STORAGE_KEY = "obrafacil:material-requirements";
const DELETED_KEY = "obrafacil:material-requirements:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `material-requirement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, MaterialRequirement> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MaterialRequirement>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, MaterialRequirement>): void {
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

export function listRequirements(): MaterialRequirement[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, MaterialRequirement>();
  if (demoDataEnabled) {
    for (const requirement of seedRequirements) {
      if (!deleted.has(requirement.id)) merged.set(requirement.id, requirement);
    }
  }
  for (const requirement of Object.values(stored)) {
    if (!deleted.has(requirement.id)) merged.set(requirement.id, requirement);
  }
  return Array.from(merged.values());
}

export function listRequirementsByProject(projectId: string): MaterialRequirement[] {
  return listRequirements().filter((requirement) => requirement.projectId === projectId);
}

export function findRequirement(projectId: string, materialId: string): MaterialRequirement | null {
  return (
    listRequirements().find(
      (requirement) => requirement.projectId === projectId && requirement.materialId === materialId
    ) ?? null
  );
}

export function getRequirement(id: string): MaterialRequirement | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  if (!demoDataEnabled) return null;
  return seedRequirements.find((requirement) => requirement.id === id) ?? null;
}

export function saveRequirement(requirement: MaterialRequirement): void {
  const store = readStore();
  store[requirement.id] = requirement;
  writeStore(store);
}

export function deleteRequirement(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createRequirementId(): string {
  return createId();
}
