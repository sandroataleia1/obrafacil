/**
 * SUPPLY-FRONTEND-01C. Purchase/GoodsReceipt are now 100% API-backed, but
 * `features/materials/prototype/material-consumption.ts` and
 * `features/stock/prototype/stock.ts` (Stock/Consumption) are explicitly
 * NOT migrated in this gate (deferred to SUPPLY-FRONTEND-01D) and need a
 * synchronous, local "physical arrival" feed for their canonical
 * stock-balance formula and movement history.
 *
 * This is a minimal WRITE-THROUGH mirror, never a second source of truth
 * for the Purchase domain: it is populated only from real API responses
 * at the moment of mutation (`GoodsReceiptForm` writes it right after a
 * successful POST; `PurchaseOrderDetail`'s delete-receipt handler removes
 * it right after a successful DELETE), and read ONLY by
 * `material-consumption.ts`/`stock.ts` — never by any Purchase/Receipt
 * screen. It is NOT one of the 8 legacy Purchase/Receipt localStorage
 * keys removed in this gate; it is a brand-new key that exists solely to
 * bridge this one still-local feature until 01D replaces it with a real
 * async read of GoodsReceipt history.
 *
 * One entry per GoodsReceiptItem line. `quantity` is the plain numeric
 * (reais-equivalent) value — the API decimal-string stays the domain
 * authority for the Purchase side; this mirror only ever feeds the
 * still-local ledger math in `material-consumption.ts`, which already
 * works in plain `number`/`toQuantityUnits`.
 */

export interface GoodsReceiptShadowEntry {
  id: string;
  goodsReceiptId: string;
  projectId: string;
  materialId: string;
  receivedAt: string;
  quantity: number;
}

const STORAGE_KEY = "obrafacil:goods-receipt-shadow";

function readStore(): Record<string, GoodsReceiptShadowEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, GoodsReceiptShadowEntry>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, GoodsReceiptShadowEntry>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listAllGoodsReceiptShadowEntries(): GoodsReceiptShadowEntry[] {
  return Object.values(readStore());
}

export function listGoodsReceiptShadowEntriesForProjectMaterial(
  projectId: string,
  materialId: string
): GoodsReceiptShadowEntry[] {
  return listAllGoodsReceiptShadowEntries().filter(
    (entry) => entry.projectId === projectId && entry.materialId === materialId
  );
}

/** Called once, right after a successful `createGoodsReceipt` API response. */
export function saveGoodsReceiptShadowEntries(entries: GoodsReceiptShadowEntry[]): void {
  const store = readStore();
  for (const entry of entries) {
    store[entry.id] = entry;
  }
  writeStore(store);
}

/** Called once, right after a successful `deleteGoodsReceipt` API response. */
export function removeGoodsReceiptShadowEntriesForReceipt(goodsReceiptId: string): void {
  const store = readStore();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.goodsReceiptId === goodsReceiptId) delete store[key];
  }
  writeStore(store);
}
