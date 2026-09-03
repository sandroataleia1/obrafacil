/**
 * Prototype hand-off between a calculator result and /orcamentos/novo.
 *
 * There is no backend yet, so we use sessionStorage to carry just enough
 * information to render the item on the new-budget screen. This is a
 * temporary structure to validate the "Calculadora → Orçamento" flow —
 * it is NOT the definitive domain model for budget items. Each calculator
 * contributes its own variant, discriminated by `source`.
 */

export interface MasonryPendingBudgetItem {
  source: "masonry";
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

export interface FloorPendingBudgetItem {
  source: "floor";
  title: string;
  areaM2: number;
  wastePercentage: number;
  coveragePerBoxM2: number;
  boxes: number;
}

export interface CeilingPanelsByLength {
  panelLengthM: number;
  physicalBars: number;
  safetyBars: number;
  purchaseBars: number;
  finalPurchasedLengthM: number;
}

export interface CeilingPendingBudgetItem {
  source: "ceiling";
  title: string;
  areaM2: number;
  wastePercentage: number;
  panelWidthM: number;
  /** Breakdown by commercial bar length — rooms can use different
   * lengths, so a single scalar length/quantity can't represent the
   * purchase without losing information (see Demo-Ready 005B/005C). */
  panelsByLength: CeilingPanelsByLength[];
  totalPurchaseBars: number;
  totalFinalPurchasedLengthM: number;
  rodaforroLengthM: number;
  rodaforros: number;
}

export interface SlabPendingBudgetItem {
  source: "slab";
  title: string;
  slabTypeLabel: string;
  areaM2: number;
  thicknessCm: number;
  wastePercentage: number;
  /** Base volume, before waste — kept for traceability. */
  concreteVolumeM3: number;
  /** Final estimated volume, already including waste — use this for
   * anything shown to the user or used to price the stage. */
  concreteVolumeWithWasteM3: number;
  fillingName: string;
  fillingUnits: number;
  cementBags: number;
  sandM3: number;
  gravelM3: number;
}

export type PendingBudgetItem =
  | MasonryPendingBudgetItem
  | FloorPendingBudgetItem
  | CeilingPendingBudgetItem
  | SlabPendingBudgetItem;

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
