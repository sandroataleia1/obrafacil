/**
 * Frontend-only financial PREVIEW for the O.S. wizard/detail screens.
 * Reproduces `App\Support\ServiceOrderMoneyCalculator` (apps/api) exactly,
 * using BigInt fixed-point arithmetic — never `Number()` for the value
 * that actually gets displayed as a final total, since plain float math
 * (`quantity * unitPrice`) can drift by a cent on repeating decimals.
 *
 * Backend formulas being mirrored:
 *   gross_line  = round_half_up(quantity × unit_price, 2)
 *   line_total  = gross_line - line_discount
 *   subtotal    = Σ line_total
 *   total       = subtotal - order_discount + travel_fee
 *
 * This is a PREVIEW ONLY (CLAUDE.md "Regra arquitetural definitiva") — the
 * backend remains the sole source of truth once `POST /service-orders` is
 * called; nothing here is ever trusted as the persisted total.
 */

/** Parses a decimal string ("12.750", "0.00", "150") into a BigInt scaled
 * by `10^decimals` — e.g. toScaled("1.5", 3) -> 1500n. Never routes
 * through `Number()`. Throws on malformed input (caller's responsibility
 * to validate shape before calling into money-preview). */
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
  const overflowDigit = fractionRaw.length > decimals ? fractionRaw[decimals] : "0";
  let scaled =
    BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(fraction === "" ? "0" : fraction);
  // Extra fractional digits beyond `decimals` are truncated, not rounded —
  // the API's own regex validation already caps quantity/money precision
  // before this ever runs, so this is a defensive fallback only.
  void overflowDigit;
  if (negative) scaled = -scaled;
  return scaled;
}

/** Formats a BigInt scaled by 100 (cents) back into a "X.YY" decimal string. */
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

/** Rounds the (non-negative) division n/d half-up, as an integer BigInt. */
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

  // quantityMilli (scale 1000) * unitPriceCents (scale 100) = scale 100000
  // (i.e. cents * 1000) — dividing by 1000 with round-half-up yields cents.
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

export interface OrderPreviewInput {
  items: LinePreviewInput[];
  /** Decimal string, 2 decimals. Defaults to "0.00". */
  orderDiscount?: string;
  /** Decimal string, 2 decimals. Defaults to "0.00". */
  travelFee?: string;
}

export interface OrderPreviewResult {
  /** Every item's line_total, in the same order as `items`. */
  lines: LinePreviewResult[];
  /** Σ line_total. */
  subtotal: string;
  /** subtotal - order_discount + travel_fee. */
  total: string;
}

/** Mirrors the backend's whole-order calculation exactly (subtotal + total). */
export function computeOrderPreview(input: OrderPreviewInput): OrderPreviewResult {
  const lines = input.items.map((item) => computeLinePreview(item));
  const subtotalCents = lines.reduce((sum, line) => sum + toScaled(line.lineTotal, 2), BigInt(0));
  const orderDiscountCents = toScaled(input.orderDiscount ?? "0.00", 2);
  const travelFeeCents = toScaled(input.travelFee ?? "0.00", 2);
  const totalCents = subtotalCents - orderDiscountCents + travelFeeCents;

  return {
    lines,
    subtotal: centsToDecimalString(subtotalCents),
    total: centsToDecimalString(totalCents),
  };
}

/** True when `discount` (decimal string) is <= `subtotal` (decimal string) — used to block an order discount that would exceed the subtotal. */
export function isDiscountWithinSubtotal(discount: string, subtotal: string): boolean {
  try {
    return toScaled(discount, 2) <= toScaled(subtotal, 2);
  } catch {
    return false;
  }
}
