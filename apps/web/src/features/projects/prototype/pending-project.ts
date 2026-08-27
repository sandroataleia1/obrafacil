/**
 * Prototype hand-off between an approved budget and /obras/nova.
 *
 * There is no backend yet, so we use sessionStorage to carry just enough
 * information to pre-fill the new-project screen. Temporary structure to
 * validate the "Orçamento aprovado → Obra" flow — NOT the definitive
 * domain model.
 */

export interface PendingProject {
  budgetId: string;
  budgetName: string;
  budgetTotal: number;
  customerId: string;
  customerName: string;
  reference?: string;
}

const STORAGE_KEY = "obrafacil:pending-project";

export function setPendingProject(item: PendingProject): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(item));
}

export function getPendingProject(): PendingProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingProject) : null;
  } catch {
    return null;
  }
}

export function clearPendingProject(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
