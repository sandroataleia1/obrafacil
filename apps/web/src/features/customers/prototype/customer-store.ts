/**
 * Prototype browser persistence for Clientes.
 *
 * There is no backend yet, so created customers are kept in localStorage,
 * layered on top of the seed data in `src/mocks/customers.ts`. Laravel +
 * PostgreSQL will replace this storage entirely once the real API exists.
 */

import { customers as seedCustomers } from "@/mocks/customers";
import { listAllBudgets } from "@/features/budgets/prototype/budget-store";
import { listAllProjects } from "@/features/projects/prototype/project-store";
import type { Customer } from "../types";

const STORAGE_KEY = "obrafacil:customers";
const DELETED_KEY = "obrafacil:customers:deleted";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): Record<string, Customer> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Customer>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Customer>): void {
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

export function listAllCustomers(): Customer[] {
  const stored = readStore();
  const deleted = readDeleted();
  const merged = new Map<string, Customer>();
  for (const customer of seedCustomers) {
    if (!deleted.has(customer.id)) merged.set(customer.id, customer);
  }
  for (const customer of Object.values(stored)) {
    if (!deleted.has(customer.id)) merged.set(customer.id, customer);
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function getCustomer(id: string): Customer | null {
  const stored = readStore();
  if (stored[id]) return stored[id];
  if (readDeleted().has(id)) return null;
  return seedCustomers.find((customer) => customer.id === id) ?? null;
}

export function saveCustomer(customer: Customer): void {
  const store = readStore();
  store[customer.id] = customer;
  writeStore(store);
}

export type CustomerResult = { ok: true } | { ok: false; error: string };

export function removeCustomer(customer: Customer): CustomerResult {
  const budgetsCount = listAllBudgets().filter(
    (budget) => budget.customerId === customer.id
  ).length;
  const projectsCount = listAllProjects().filter(
    (project) => project.customerId === customer.id
  ).length;
  if (budgetsCount > 0 || projectsCount > 0) {
    return {
      ok: false,
      error: "Este cliente possui orçamentos ou obras vinculados e não pode ser excluído.",
    };
  }

  const store = readStore();
  delete store[customer.id];
  writeStore(store);

  const deleted = readDeleted();
  deleted.add(customer.id);
  writeDeleted(deleted);

  return { ok: true };
}

export function createCustomer(
  input: Pick<Customer, "name" | "phone"> & Partial<Pick<Customer, "email" | "document">>
): Customer {
  const now = new Date().toISOString().slice(0, 10);
  const customer: Customer = {
    id: createId(),
    name: input.name,
    phone: input.phone,
    email: input.email,
    document: input.document,
    createdAt: now,
    updatedAt: now,
  };
  saveCustomer(customer);
  return customer;
}
