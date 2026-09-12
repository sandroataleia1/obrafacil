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

/**
 * ISO instant (e.g. "2026-09-10T13:00:00.000000Z") -> the `YYYY-MM-DDTHH:mm`
 * shape a `datetime-local` input expects, in the VIEWER'S LOCAL time.
 * Deliberately builds the string from `Date`'s local getters
 * (`getFullYear()`/`getMonth()`/`getDate()`/`getHours()`/`getMinutes()`),
 * never by slicing the ISO string itself — a naive slice would keep the
 * UTC wall-clock time and silently reinterpret it as if it were already
 * local, shifting the displayed instant by the viewer's UTC offset. Round
 * trips with `new Date(value).toISOString()` (the wizard's existing
 * local -> ISO approach) to the minute — `datetime-local` has no seconds,
 * so a non-zero seconds/ms component on the original ISO instant is
 * necessarily lost, same as it would be in the wizard's own new-value path.
 * `null`/invalid -> "".
 */
export function isoToDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
