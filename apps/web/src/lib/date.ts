export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR");
}

/**
 * Today's date as a local YYYY-MM-DD string. Deliberately avoids
 * `Date#toISOString()`, which converts to UTC and can shift the
 * calendar day near midnight depending on the viewer's timezone.
 */
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Maps a date-only "YYYY-MM-DD" string to a whole day number, via
 * `Date.UTC` — never the local-time constructor. A date-only string
 * represents a calendar day, not an instant, so any arithmetic on it
 * must stay independent of the viewer's timezone/DST; parsing through
 * local time (`new Date(iso + "T00:00:00")`) can shift the day count
 * by one around a DST transition.
 */
export function dateOnlyToDayNumber(dateOnly: string): number {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whole calendar days between two date-only strings (`to` − `from`), timezone-independent. */
export function daysBetweenDateOnly(from: string, to: string): number {
  return dateOnlyToDayNumber(to) - dateOnlyToDayNumber(from);
}
