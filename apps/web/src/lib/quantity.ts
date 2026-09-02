/**
 * Helpers for material quantities (m³, kg, sc, etc.) — a separate
 * dimension from money. Never reuse `toCents()` from `lib/currency.ts`
 * for quantity comparisons; the precision and meaning are different.
 */

/**
 * Normalizes a quantity to an integer at 3-decimal precision, for
 * safe comparisons/limits (e.g. "received <= ordered"). Mirrors
 * `toCents()`'s reasoning: plain floats can cause incorrect boundary
 * checks (e.g. `12.75 - 12.74` not being exactly `0.01`). Values stay
 * `number` (the real unit, e.g. m³ or kg) everywhere else — this is
 * only for validation math. 3 decimals covers m³/kg/L fractions this
 * prototype needs without introducing a decimal library.
 */
export function toQuantityUnits(value: number): number {
  return Math.round(value * 1000);
}

/** Formats a quantity in pt-BR ("1,5", "12,75", "100"), no currency symbol. */
export function formatQuantity(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/**
 * Normalizes a quantity to at most 3 decimal places before persisting
 * — the canonical precision this prototype stores everywhere
 * (PurchaseOrderItem.quantity, GoodsReceiptItem.quantity). Using the
 * same rounding here that `toQuantityUnits` uses for comparisons
 * guarantees a value can never be "positive but normalizes to zero"
 * once persisted (e.g. 0.0004 is rejected by `isPositiveQuantity`
 * before this would ever run on it).
 */
export function normalizeQuantity(value: number): number {
  return toQuantityUnits(value) / 1000;
}

/** True when the quantity's normalized (3-decimal) value is strictly positive. */
export function isPositiveQuantity(value: number): boolean {
  return toQuantityUnits(value) > 0;
}
