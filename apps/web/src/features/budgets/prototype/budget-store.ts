/**
 * Prototype browser persistence for the Orçamentos v1 flow.
 *
 * There is no backend yet, so created/edited budgets are kept in
 * localStorage, layered on top of the seed data in `src/mocks/budgets.ts`.
 * Laravel + PostgreSQL will replace this storage entirely once the real
 * API exists — nothing here should be treated as the definitive
 * persistence model.
 */

import { budgets as seedBudgets } from "@/mocks/budgets";
import type { Budget } from "../types";

const STORAGE_KEY = "obrafacil:budgets";
const DELETED_KEY = "obrafacil:budgets:deleted";
const DIACRITICS_PATTERN = /\p{Diacritic}/gu;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readStore(): Record<string, Budget> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Budget>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Budget>): void {
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

export function listAllBudgets(): Budget[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Budget>();
  for (const budget of seedBudgets) {
    if (!deleted.has(budget.id)) merged.set(budget.id, budget);
  }
  for (const budget of Object.values(stored)) {
    if (!deleted.has(budget.id)) merged.set(budget.id, budget);
  }
  return Array.from(merged.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export function getBudget(id: string): Budget | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedBudgets.find((budget) => budget.id === id) ?? null;
}

export function getBudgetByToken(token: string): Budget | null {
  return listAllBudgets().find((budget) => budget.proposalToken === token) ?? null;
}

export function saveBudget(budget: Budget): void {
  const store = readStore();
  store[budget.id] = budget;
  writeStore(store);
}

export function deleteBudget(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(id);
  writeDeleted(deleted);
}

function idExists(id: string): boolean {
  return seedBudgets.some((budget) => budget.id === id) || id in readStore();
}

export function createBudgetId(name: string): string {
  const base = slugify(name);
  if (base && !idExists(base)) return base;

  let counter = 1;
  const prefix = base || "orcamento";
  while (idExists(`${prefix}-${counter}`)) counter++;
  return `${prefix}-${counter}`;
}
