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
