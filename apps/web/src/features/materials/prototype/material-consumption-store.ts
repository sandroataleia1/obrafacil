/**
 * Prototype browser persistence for MaterialConsumption. There is no
 * backend yet, so created/removed consumptions are kept in
 * localStorage, layered on top of the seed data in
 * `src/mocks/material-consumptions.ts`. Pure persistence — invariants
 * (available balance, Project/Material existence) live in
 * `material-consumption.ts`.
 */

import { materialConsumptions as seedMaterialConsumptions } from "@/mocks/material-consumptions";
import type { MaterialConsumption } from "../types";

const STORAGE_KEY = "obrafacil:material-consumptions";
const DELETED_KEY = "obrafacil:material-consumptions:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `material-consumption-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, MaterialConsumption> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MaterialConsumption>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, MaterialConsumption>): void {
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

function sortByConsumedAtDesc(a: MaterialConsumption, b: MaterialConsumption): number {
  return b.consumedAt.localeCompare(a.consumedAt) || b.createdAt.localeCompare(a.createdAt);
}

export function listMaterialConsumptions(): MaterialConsumption[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, MaterialConsumption>();
  for (const consumption of seedMaterialConsumptions) {
    if (!deleted.has(consumption.id)) merged.set(consumption.id, consumption);
  }
  for (const consumption of Object.values(stored)) {
    if (!deleted.has(consumption.id)) merged.set(consumption.id, consumption);
  }
  return Array.from(merged.values()).sort(sortByConsumedAtDesc);
}

export function listConsumptionsByProject(projectId: string): MaterialConsumption[] {
  return listMaterialConsumptions().filter((consumption) => consumption.projectId === projectId);
}

export function listConsumptionsByProjectAndMaterial(
  projectId: string,
  materialId: string
): MaterialConsumption[] {
  return listMaterialConsumptions().filter(
    (consumption) => consumption.projectId === projectId && consumption.materialId === materialId
  );
}

export function getMaterialConsumption(id: string): MaterialConsumption | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedMaterialConsumptions.find((consumption) => consumption.id === id) ?? null;
}

export function saveMaterialConsumption(consumption: MaterialConsumption): void {
  const store = readStore();
  store[consumption.id] = consumption;
  writeStore(store);
}

export function deleteMaterialConsumption(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createMaterialConsumptionId(): string {
  return createId();
}
