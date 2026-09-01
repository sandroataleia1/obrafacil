const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026-08" -> "Agosto de 2026". Plain string parsing, no Date/timezone involved. */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  const monthName = MONTH_LABELS[Number(month) - 1] ?? month;
  return `${monthName} de ${year}`;
}

/** "2026-08" -> "Agosto/2026". */
export function formatPeriodShort(period: string): string {
  const [year, month] = period.split("-");
  const monthName = MONTH_LABELS[Number(month) - 1] ?? month;
  return `${monthName}/${year}`;
}

/**
 * "2026-02" -> "2026-02-28", "2028-02" -> "2028-02-29" (leap year),
 * "2026-08" -> "2026-08-31". Used as the economic-competency date for
 * costs allocated from a work period. `new Date(year, month, 0)` uses
 * local numeric components (not string parsing), so it never hits the
 * UTC-string-parsing pitfall that shifts a calendar day near midnight.
 */
export function lastDayOfPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearStr}-${monthStr.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
