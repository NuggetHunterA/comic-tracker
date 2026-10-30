// Dates are ISO strings (YYYY-MM-DD) in local time; the app only cares about days.

export function todayIso(now = new Date()): string {
  return toIso(now);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

const WEEKDAYS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const MONTHS = ["JAN", "FEB", "MÄR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];

/** "29.10." */
export function shortDate(iso: string): string {
  const d = fromIso(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** "MI 29.10." */
export function dayLabel(iso: string): string {
  return `${WEEKDAYS[fromIso(iso).getDay()]} ${shortDate(iso)}`;
}

/** "NOV" or "NOV 2026" */
export function monthLabel(iso: string, withYear = false): string {
  const d = fromIso(iso);
  return withYear ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()];
}

/** Monday of the week the day falls in; release weeks group by it. */
export function weekStart(iso: string): string {
  return addDays(iso, -((fromIso(iso).getDay() + 6) % 7));
}

export function monthStart(iso: string, offset = 0): string {
  const d = fromIso(iso);
  return toIso(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

/** "MI 29.10." this year, "1.6.2024" otherwise. */
export function dateLabel(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? dayLabel(iso) : `${shortDate(iso)}${iso.slice(0, 4)}`;
}
