/**
 * Turns whatever a write or fetch threw into one German sentence for the screen.
 * The raw error goes to the console, so nothing is lost for debugging.
 */

/** An error whose message is already meant for Adrian; shown as it is. */
export class Hinweis extends Error {}

const OFFLINE = "Keine Verbindung. Prüf das Netz und versuch es nochmal.";
const SESSION = "Die Anmeldung ist abgelaufen. Lad die App neu.";
const SERVER = "Der Server antwortet gerade nicht. Versuch es gleich nochmal.";
const BUSY = "Zu viele Anfragen auf einmal. Warte kurz und versuch es nochmal.";
const DENIED = "Das darf die App gerade nicht speichern. Lad die App neu.";
const FALLBACK = "Das hat nicht geklappt. Versuch es nochmal.";

interface Raw {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
  context?: { status?: number };
}

export function explain(e: unknown): string {
  if (e instanceof Hinweis) return e.message;
  const r: Raw = typeof e === "string" ? { message: e } : ((e ?? {}) as Raw);
  const msg = r.message ?? "";
  const status = r.status ?? r.context?.status;

  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  if (/failed to fetch|networkerror|load failed|network request failed|failed to send a request/i.test(msg) || r.name === "FunctionsFetchError") return OFFLINE;
  if (status === 401 || r.code === "PGRST301" || r.code === "PGRST303" || /jwt|unauthori[sz]ed|not authenticated|refresh token/i.test(msg)) return SESSION;
  if (status === 429 || /rate.?limit/i.test(msg)) return BUSY;
  if (status === 403 || r.code === "42501" || /row-level security|permission denied|forbidden/i.test(msg)) return DENIED;
  if ((status !== undefined && status >= 500) || r.code === "57014" || /timeout|timed out|non-2xx|relay/i.test(msg)) return SERVER;
  return FALLBACK;
}

/** explain() plus a console trace of the original. */
export function report(e: unknown): string {
  console.error(e);
  return explain(e);
}
