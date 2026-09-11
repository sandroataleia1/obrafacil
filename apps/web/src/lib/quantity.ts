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

/**
 * Accepts Brazilian-typed quantity input ("1", "1,5", "12,750") and
 * normalizes it to the decimal-string shape the API expects ("1.000",
 * "1.500", "12.750" — always exactly 3 decimals, comma never sent raw).
 * Mirrors `lib/currency.ts`'s `brlInputToDecimalString` intent for the
 * quantity dimension (Service Orders `items[].quantity`). Returns `null`
 * for empty input or anything that doesn't normalize to a strictly
 * positive value — the API requires `quantity > 0`, so this never
 * produces "0.000" or a negative string for the caller to send.
 */
export function quantityInputToDecimalString(raw: string): string | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (cleaned === "") return null;

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const [integerPartRaw, fractionPartRaw = ""] = normalized.split(".");
  const fractionPart = `${fractionPartRaw}000`.slice(0, 3);
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "");

  const result = `${integerPart}.${fractionPart}`;
  return isPositiveQuantity(Number(result)) ? result : null;
}

/** Decimal string ("1.500") -> BR display value for an editable input ("1,5"). Trims trailing zeros/dot for a cleaner typing experience; `null`/invalid -> "". */
export function decimalStringToQuantityInputValue(value: string | null): string {
  if (value === null) return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
