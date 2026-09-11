/**
 * Helpers for BRL currency input/display. Accepts common Brazilian
 * variations ("2500", "2500,50", "2.500,50", "R$ 2.500,50") without a
 * dedicated parsing library.
 */

export function parseCurrencyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (cleaned === "") return null;

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Normalizes a monetary value to integer cents for comparisons/limits
 * (e.g. "allocated <= expected"). Plain floats like `2909.0900000000006`
 * can otherwise cause incorrect boundary checks. Values stay `number`
 * (reais) everywhere else — this is only for validation math.
 */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * FRONTEND-CATALOG-01 §24: the API's money contract is a decimal STRING
 * ("18.50", never a binary float) — this never routes through `Number()`
 * as the final representation sent to the server (string splitting only,
 * so "999999,99" never touches floating-point at all). Returns `null` for
 * empty input, and for anything that isn't a valid non-negative amount
 * (including a leading "-") — negative values are rejected locally by
 * never producing a string for them, never by sending one and letting the
 * server reject it.
 */
export function brlInputToDecimalString(raw: string): string | null {
  const cleaned = raw.replace(/[^\d,.-]/g, "").trim();
  if (cleaned === "") return null;

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,})?$/.test(normalized) && !/^\d+$/.test(normalized)) {
    return null;
  }

  const [integerPart, fractionPartRaw = ""] = normalized.split(".");
  const fractionPart = `${fractionPartRaw}00`.slice(0, 2);
  const cleanedIntegerPart = integerPart.replace(/^0+(?=\d)/, "");

  return `${cleanedIntegerPart}.${fractionPart}`;
}

/**
 * The exact inverse of `brlInputToDecimalString`'s intent for *display*:
 * a decimal string from the API ("18.50") to a BRL-formatted string
 * ("R$ 18,50"). `null` (never persisted) renders as `null` here too — the
 * caller decides the "—"/"Não informado" copy, this never invents "R$ 0,00"
 * for an absent value.
 */
export function decimalStringToBrlDisplay(value: string | null): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return formatCurrency(numeric);
}

/**
 * Pre-fills a `MoneyField` (which already renders its own fixed "R$"
 * prefix) with a decimal string from the API — the number only, never
 * the "R$"-prefixed label text `decimalStringToBrlDisplay` produces,
 * which would otherwise duplicate the prefix visually in the input.
 */
export function decimalStringToMoneyInputValue(value: string | null): string {
  const display = decimalStringToBrlDisplay(value);
  return display ? display.replace(/^R\$\s*/, "") : "";
}
