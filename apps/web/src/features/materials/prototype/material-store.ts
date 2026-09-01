/**
 * Prototype browser persistence for the Materiais catalog.
 *
 * There is no backend yet, so created/edited/removed materials are
 * kept in localStorage, layered on top of the seed data in
 * `src/mocks/materials.ts`. Laravel + PostgreSQL will replace this
 * storage entirely once the real API exists.
 *
 * `deleteMaterial()` is unconditional in this v1 — PurchaseOrderItem
 * and MaterialConsumption don't exist yet, so there is no real
 * dependency to guard against. A future task must add a guard here
 * once those entities exist, mirroring `removeReceivable`'s Receipt
 * guard. Inactivation (`status: "inactive"`) is the normal removal
 * path for a Material already referenced by a MaterialRequirement.
 */

import { materials as seedMaterials } from "@/mocks/materials";
import type { Material } from "../types";

const STORAGE_KEY = "obrafacil:materials";
const DELETED_KEY = "obrafacil:materials:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Material> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Material>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Material>): void {
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

function sortByNameAsc(a: Material, b: Material): number {
  return a.name.localeCompare(b.name, "pt-BR");
}

export function listMaterials(): Material[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Material>();
  for (const material of seedMaterials) {
    if (!deleted.has(material.id)) merged.set(material.id, material);
  }
  for (const material of Object.values(stored)) {
    if (!deleted.has(material.id)) merged.set(material.id, material);
  }
  return Array.from(merged.values()).sort(sortByNameAsc);
}

export function listActiveMaterials(): Material[] {
  return listMaterials().filter((material) => material.status === "active");
}

export function getMaterial(id: string): Material | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedMaterials.find((material) => material.id === id) ?? null;
}

export function saveMaterial(material: Material): void {
  const store = readStore();
  store[material.id] = material;
  writeStore(store);
}

export function deleteMaterial(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

export function createMaterialId(): string {
  return createId();
}
