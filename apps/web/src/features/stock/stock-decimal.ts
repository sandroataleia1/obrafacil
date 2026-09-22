/**
 * SUPPLY-FRONTEND-01D §14. `MaterialConsumption.quantity`/
 * `StockAdjustment.quantity` are decimal strings at scale 3, `gt:0`
 * (`StoreMaterialConsumptionRequest`/`StoreStockAdjustmentRequest`).
 * Mirrors `features/purchases/purchase-decimal.ts`'s
 * `purchaseQuantityInputToApi`/`purchaseDecimalApiToInput` exactly (same
 * contract, same regex) — duplicated rather than shared, matching this
 * codebase's established per-domain convention (`requirement-quantity.ts`,
 * `purchase-decimal.ts`). REJECTS (never truncates) anything outside the
 * contract, and never uses a JS `float` as the payload's authority.
 */

function parseDecimal(raw: string, maxDecimals: number): string | null {
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
  if (!Number.isFinite(value) || value <= 0) return null;
  return canonical;
}

/** BR-typed quantity input -> canonical API decimal string, scale 3, `gt:0`. */
export function stockQuantityInputToApi(raw: string): string | null {
  return parseDecimal(raw, 3);
}

/** Canonical API decimal string -> BR-typed display value. Pure string substitution — never rounds. */
export function stockDecimalApiToInput(value: string): string {
  return value.replace(".", ",");
}

/**
 * §50: a PRESENTATION-only helper — the domain value stays the string
 * everywhere else. Trims trailing zeros (`"1.000"` → `"1"`,
 * `"1.250"` → `"1,25"`) via `Number().toLocaleString`, which is safe
 * here because it never round-trips back into a payload — only ever
 * used for what a viewer reads on screen.
 */
export function formatStockQuantity(value: string): string {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
