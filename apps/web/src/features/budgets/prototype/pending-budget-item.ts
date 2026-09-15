/**
 * Hand-off between a calculator result and /orcamentos/novo.
 *
 * The calculators still run their quantitative logic entirely in the
 * frontend (that part remains provisional per CLAUDE.md), but this handoff
 * itself is just transient transport: it carries one pending item from a
 * calculator screen to the real Budget API-backed create form, in
 * sessionStorage, across a client-side navigation. It is NOT the
 * definitive domain model for budget items — that lives in the Budget API
 * (BudgetItem). Each calculator contributes its own variant, discriminated
 * by `source`.
 *
 * FRONTEND-BUDGETS-01A §5-8: this handoff is tenant-scoped. The storage
 * key is keyed by `companyId` — a calculator result created under
 * Company A must never surface under Company B, and vice-versa. Every
 * function requires the CALLER to pass the current `activeCompany.id`
 * explicitly (never read from anywhere else): `setPendingBudgetItem`
 * fails closed (no-op, returns `false`) when there is no active company
 * rather than ever writing an unowned handoff (§7). The pre-existing
 * unscoped key (`obrafacil:pending-budget-item`, no company suffix) is
 * never read into a result — `getPendingBudgetItem`/`getPendingBudgetHandoff`
 * opportunistically remove it if found, but never let its content answer a
 * lookup (§8) — reusing it would silently hand one tenant's calculator
 * result to whichever tenant happens to load `/orcamentos/novo` next.
 *
 * FRONTEND-BUDGETS-01A1 §3-4: the stored envelope carries a stable `id`
 * (not just the raw item) so a consumer that submitted a POST using one
 * particular handoff can later remove *exactly that* handoff — and only
 * that one — even if the request is still in flight when a newer handoff
 * (same company) replaces it in storage, or the active company changes
 * before the request resolves. `consumePendingBudgetItem` is the only
 * function allowed to remove a handoff conditionally on its `id` still
 * matching what's currently stored.
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

/** §3: the envelope actually persisted in storage — gives the handoff a
 * stable identity independent of its content, so a consumer can prove it
 * is removing the exact handoff it used, not just "whatever is there now". */
export interface PendingBudgetHandoff {
  id: string;
  item: PendingBudgetItem;
}

interface StoredHandoffEnvelope {
  version: 1;
  id: string;
  item: PendingBudgetItem;
}

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

function generateHandoffId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `handoff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readEnvelope(companyId: string): StoredHandoffEnvelope | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(companyId));
    return raw ? (JSON.parse(raw) as StoredHandoffEnvelope) : null;
  } catch {
    return null;
  }
}

/** §7: fails closed — returns `false` and writes nothing when there is
 * no active company, rather than ever creating an unowned handoff. */
export function setPendingBudgetItem(companyId: string | undefined, item: PendingBudgetItem): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  try {
    const envelope: StoredHandoffEnvelope = { version: 1, id: generateHandoffId(), item };
    window.sessionStorage.setItem(storageKey(companyId), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function getPendingBudgetItem(companyId: string | undefined): PendingBudgetItem | null {
  if (typeof window === "undefined") return null;
  discardLegacyUnscopedHandoff();
  if (!companyId) return null;
  return readEnvelope(companyId)?.item ?? null;
}

/** §4: like `getPendingBudgetItem`, but also returns the handoff's stable
 * `id` — callers that will later need to conditionally consume this exact
 * handoff (e.g. after a POST resolves) must capture it from here. */
export function getPendingBudgetHandoff(companyId: string | undefined): PendingBudgetHandoff | null {
  if (typeof window === "undefined") return null;
  discardLegacyUnscopedHandoff();
  if (!companyId) return null;
  const envelope = readEnvelope(companyId);
  return envelope ? { id: envelope.id, item: envelope.item } : null;
}

export function clearPendingBudgetItem(companyId: string | undefined): void {
  if (typeof window === "undefined" || !companyId) return;
  window.sessionStorage.removeItem(storageKey(companyId));
}

/** §4/§10: removes the stored handoff for `companyId` ONLY if the id
 * currently stored still matches `expectedHandoffId` — i.e. only if it is
 * still the exact handoff a caller previously read and used (e.g. for a
 * POST). If a newer handoff has since replaced it (a different `id`), or
 * there is nothing stored at all, this is a no-op and returns `false`. This
 * is the only way a "did my POST use this input" caller should ever clear
 * a handoff — never `clearPendingBudgetItem`, which removes unconditionally. */
export function consumePendingBudgetItem(companyId: string | undefined, expectedHandoffId: string): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  const envelope = readEnvelope(companyId);
  if (!envelope || envelope.id !== expectedHandoffId) return false;
  window.sessionStorage.removeItem(storageKey(companyId));
  return true;
}
