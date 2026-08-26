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
