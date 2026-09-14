/**
 * Frontend-only per-line validation preview for the Budget item dialogs
 * (add/edit) — mirrors `features/service-orders/money-preview.ts`'s
 * `computeLinePreview`/`isDiscountWithinSubtotal` exactly (same
 * BigInt fixed-point arithmetic, same formulas), duplicated in this
 * feature rather than imported cross-feature so `features/budgets`
 * never depends on `features/service-orders`.
 *
 * This is a PREVIEW ONLY (CLAUDE.md "Regra arquitetural definitiva") —
 * used solely to disable "Adicionar"/"Salvar" when a typed discount
 * would exceed the line's gross value before ever sending the request.
 * The Budget's own `sale_subtotal`/`cost_subtotal`/`margin_amount`/
 * `margin_percentage`/`total` are NEVER recomputed here — those are
 * always re-read from a fresh `GET /budgets/{id}` after any mutation.
 */

function toScaled(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw, fractionRaw = ""] = unsigned.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (!/^\d+$/.test(whole) || (fractionRaw !== "" && !/^\d+$/.test(fractionRaw))) {
    throw new Error(`money-preview: invalid decimal string "${value}"`);
  }
  const fraction = fractionRaw.slice(0, decimals).padEnd(decimals, "0");
  let scaled = BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction === "" ? "0" : fraction);
  if (negative) scaled = -scaled;
  return scaled;
}

function centsToDecimalString(cents: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const negative = cents < zero;
  const abs = negative ? -cents : cents;
  const whole = abs / hundred;
  const frac = abs % hundred;
  const result = `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
  return negative ? `-${result}` : result;
}

function roundHalfUpDiv(n: bigint, d: bigint): bigint {
  const zero = BigInt(0);
  if (n < zero) throw new Error("money-preview: roundHalfUpDiv expects a non-negative numerator");
  return (BigInt(2) * n + d) / (BigInt(2) * d);
}

export interface LinePreviewInput {
  /** Decimal string, up to 3 decimals (e.g. "1.500"). */
  quantity: string;
  /** Decimal string, 2 decimals (e.g. "150.00"). */
  unitPrice: string;
  /** Decimal string, 2 decimals. Defaults to "0.00" when omitted. */
  lineDiscount?: string;
}

export interface LinePreviewResult {
  /** quantity × unit_price, rounded half-up to 2 decimals — "gross_line". */
  grossLine: string;
  /** gross_line - line_discount — "line_total". */
  lineTotal: string;
}

/** Mirrors the backend's per-item gross/line_total calculation exactly. */
export function computeLinePreview(input: LinePreviewInput): LinePreviewResult {
  const quantityMilli = toScaled(input.quantity, 3);
  const unitPriceCents = toScaled(input.unitPrice, 2);
  const lineDiscountCents = toScaled(input.lineDiscount ?? "0.00", 2);

  const product = quantityMilli * unitPriceCents;
  const thousand = BigInt(1000);
  const grossLineCents =
    product < BigInt(0) ? -roundHalfUpDiv(-product, thousand) : roundHalfUpDiv(product, thousand);
  const lineTotalCents = grossLineCents - lineDiscountCents;

  return {
    grossLine: centsToDecimalString(grossLineCents),
    lineTotal: centsToDecimalString(lineTotalCents),
  };
}

/** True when `discount` (decimal string) is <= `subtotal` (decimal string). */
export function isDiscountWithinSubtotal(discount: string, subtotal: string): boolean {
  try {
    return toScaled(discount, 2) <= toScaled(subtotal, 2);
  } catch {
    return false;
  }
}
