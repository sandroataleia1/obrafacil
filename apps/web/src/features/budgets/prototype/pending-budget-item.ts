/**
 * Prototype hand-off between a calculator result and /orcamentos/novo.
 *
 * There is no backend yet, so we use sessionStorage to carry just enough
 * information to render the item on the new-budget screen. This is a
 * temporary structure to validate the "Calculadora → Orçamento" flow —
 * it is NOT the definitive domain model for budget items. Each calculator
 * contributes its own variant, discriminated by `source`.
 *
 * FRONTEND-BUDGETS-01A §5-8: this handoff is tenant-scoped. The storage
 * key is keyed by `companyId` — a calculator result created under
 * Company A must never surface under Company B, and vice-versa. Every
 * function requires the CALLER to pass the current `activeCompany.id`
 * explicitly (never read from anywhere else): `setPendingBudgetItem`
 * fails closed (no-op, returns `false`) when there is no active company
 * rather than ever writing an unowned handoff (§7). The pre-existing
 * unscoped key (`obrafacil:pending-budget-item`, no company suffix) is
 * never read into a result — `getPendingBudgetItem` opportunistically
 * removes it if found, but never lets its content answer a lookup
 * (§8) — reusing it would silently hand one tenant's calculator result
 * to whichever tenant happens to load `/orcamentos/novo` next.
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

const STORAGE_KEY_PREFIX = "obrafacil:pending-budget-item:";
/** §8: the old, unscoped key — never read into a result, only removed. */
const LEGACY_UNSCOPED_KEY = "obrafacil:pending-budget-item";

function storageKey(companyId: string): string {
  return `${STORAGE_KEY_PREFIX}${companyId}`;
}

/** §8: opportunistic cleanup — the legacy key has no tenant owner, so it
 * must never be attributed to whichever company happens to read next. */
function discardLegacyUnscopedHandoff(): void {
  try {
    window.sessionStorage.removeItem(LEGACY_UNSCOPED_KEY);
  } catch {
    // sessionStorage unavailable (private mode, etc.) — nothing to clean.
  }
}

/** §7: fails closed — returns `false` and writes nothing when there is
 * no active company, rather than ever creating an unowned handoff. */
export function setPendingBudgetItem(companyId: string | undefined, item: PendingBudgetItem): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    window.sessionStorage.setItem(storageKey(companyId), JSON.stringify(item));
    return true;
  } catch {
    return false;
  }
}

export function getPendingBudgetItem(companyId: string | undefined): PendingBudgetItem | null {
  if (typeof window === "undefined") return null;
  discardLegacyUnscopedHandoff();
  if (!companyId) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(companyId));
    return raw ? (JSON.parse(raw) as PendingBudgetItem) : null;
  } catch {
    return null;
  }
}

export function clearPendingBudgetItem(companyId: string | undefined): void {
  if (typeof window === "undefined" || !companyId) return;
  window.sessionStorage.removeItem(storageKey(companyId));
}
