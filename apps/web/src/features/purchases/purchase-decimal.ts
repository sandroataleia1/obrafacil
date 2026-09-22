/**
 * SUPPLY-FRONTEND-01C §17-18. `PurchaseOrderItem.quantity`/
 * `GoodsReceiptItem.quantity` are decimal strings at scale 3, `gt:0`
 * (`StorePurchaseOrderItemRequest`/`StoreGoodsReceiptRequest`).
 * `unit_price` is a decimal string at scale 2, `min:0` (zero IS allowed —
 * a free/no-charge line). Mirrors
 * `features/materials/requirement-quantity.ts` exactly — REJECTS (never
 * truncates) anything outside the contract, and never uses a JS `float`
 * as the payload's authority.
 */

function parseDecimal(raw: string, maxDecimals: number, allowZero: boolean): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^[\d.,]+$/.test(trimmed)) return null;

  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(normalized)) return null;

  const [integerPartRaw, fractionPart] = normalized.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "");
  const canonical = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;

  const value = Number(canonical);
  if (!Number.isFinite(value)) return null;
  if (allowZero ? value < 0 : value <= 0) return null;
  return canonical;
}

/** BR-typed quantity input -> canonical API decimal string, scale 3, `gt:0`. */
export function purchaseQuantityInputToApi(raw: string): string | null {
  return parseDecimal(raw, 3, false);
}

/** BR-typed money input -> canonical API decimal string, scale 2, `min:0` (zero allowed). */
export function purchaseUnitPriceInputToApi(raw: string): string | null {
  return parseDecimal(raw, 2, true);
}

/** Canonical API decimal string -> BR-typed editable input value. Pure string substitution — never rounds. */
export function purchaseDecimalApiToInput(value: string): string {
  return value.replace(".", ",");
}
