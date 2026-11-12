// When to ask Metron (again) for an issue's writer, shared by the app and the metron Edge Function.
// Metron mostly credits writers around the release day, so an empty answer before then is not final.

export const WRITER_RETRY_DAYS = 7;
// After this many days past release, an issue without a writer is left alone.
export const WRITER_GIVE_UP_DAYS = 90;

export interface WriterState {
  writer: string | null;
  writer_synced_at: string | null;
  store_date: string | null;
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);

/** Berlin calendar day, YYYY-MM-DD, the day the app counts in. */
export const berlinDay = (now = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);

/**
 * True when the writer is worth looking up: never asked yet; asked before release and the
 * release day has come; or still empty a week after the last try (until 90 days past release).
 */
export function writerDue(issue: WriterState, now = new Date()): boolean {
  if (issue.writer) return false;
  if (!issue.writer_synced_at) return true;
  const today = berlinDay(now);
  const store = issue.store_date ? dayOf(issue.store_date) : null;
  if (store && store > today) return false;
  if (store && dayOf(issue.writer_synced_at) < store) return true;
  if (store && Date.parse(`${store}T00:00:00Z`) < now.getTime() - WRITER_GIVE_UP_DAYS * DAY_MS) return false;
  return Date.parse(issue.writer_synced_at) < now.getTime() - WRITER_RETRY_DAYS * DAY_MS;
}
