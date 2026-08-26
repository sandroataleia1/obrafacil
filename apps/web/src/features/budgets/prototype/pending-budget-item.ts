/**
 * Prototype hand-off between a calculator result and /orcamentos/novo.
 *
 * There is no backend yet, so we use sessionStorage to carry just enough
 * information to render the item on the new-budget screen. This is a
 * temporary structure to validate the "Calculadora → Orçamento" flow —
 * it is NOT the definitive domain model for budget items.
 */

export interface PendingBudgetItem {
  source: "masonry-calculation";
  title: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  netAreaM2: number;
  wastePercentage: number;
  auxiliaryMaterials: {
    cementBags: number;
    limeBags: number;
    sandM3: number;
  };
}

const STORAGE_KEY = "obrafacil:pending-budget-item";

export function setPendingBudgetItem(item: PendingBudgetItem): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(item));
}

export function getPendingBudgetItem(): PendingBudgetItem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingBudgetItem) : null;
  } catch {
    return null;
  }
}

export function clearPendingBudgetItem(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
