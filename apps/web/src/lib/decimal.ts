/**
 * Helpers to accept Brazilian decimal notation (comma as separator) in
 * plain text inputs (`inputMode="decimal"`) without forcing users to type
 * a dot.
 */

export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatDecimal(value: number, fractionDigits = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatInteger(value: number): string {
  return value.toLocaleString("pt-BR");
}
