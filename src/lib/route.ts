import type { FoundSeries } from "../components/SeriesSearch";

// Where the app is, written into the URL hash so the back button and links work.
//
//   #plan                      #plan/heft/12
//   #stapel                    #stapel/serie/4  #stapel/serie/4/alle  #stapel/serie/4/alle/12
//   #stapel/heft/12            #stapel/heft/12/serie/4  #stapel/heft/12/alle/4
//   #stapel/eintragen          #stapel/serien-ordnen  #stapel/reihenfolge
//   #stapel/jahr/2026          #stapel/jahr/2026/heft/12
//   #katalog                   #katalog/heft/12
//   #serien  #serien/wunsch    #serien/events  #serien/events/7
//   #serien/serie/4            #serien/serie/4/alle  #serien/serie/4/alle/12
//   #serien/heft/12            #serien/heft/12/serie/4  #serien/heft/12/alle/4/12

export type Tab = "plan" | "stapel" | "katalog" | "serien";
export type SerienTab = "serien" | "wunsch" | "events";

export type StapelSel =
  | { kind: "series"; id: number }
  | { kind: "all"; id: number; sel?: number }
  | { kind: "issue"; id: number; series?: number; fromAll?: boolean }
  | { kind: "import" }
  | { kind: "order" }
  | { kind: "list" }
  /** The Jahreswand of one year, maybe with an issue open over it. */
  | { kind: "year"; year: number; issue?: number }
  | null;

export type SerienSel =
  | { kind: "series"; id: number; found?: FoundSeries }
  | { kind: "all"; id: number; sel?: number }
  | { kind: "issue"; id: number; back?: SerienSel }
  | { kind: "event"; id: number }
  | null;

export type Route =
  | { tab: "plan"; sel: number | null }
  | { tab: "stapel"; sel: StapelSel }
  | { tab: "katalog"; sel: number | null }
  | { tab: "serien"; sub: SerienTab; sel: SerienSel };

const TABS: Tab[] = ["plan", "stapel", "katalog", "serien"];

/** A series found in the search is not in the store yet; its row is kept here for the session. */
const found = new Map<number, FoundSeries>();

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || !/^\d+$/.test(s)) return undefined;
  return Number(s);
};

function parseSerienSel(p: string[]): SerienSel {
  const [kind, a, ...rest] = p;
  const id = num(a);
  if (id === undefined) return null;
  if (kind === "event") return { kind: "event", id };
  if (kind === "serie") {
    if (rest[0] === "alle") {
      const sel = num(rest[1]);
      return sel === undefined ? { kind: "all", id } : { kind: "all", id, sel };
    }
    const f = found.get(id);
    return f ? { kind: "series", id, found: f } : { kind: "series", id };
  }
  if (kind === "heft") {
    const back = rest.length ? parseSerienSel(rest[0] === "alle" ? ["serie", rest[1], "alle", ...rest.slice(2)] : rest) : null;
    return back ? { kind: "issue", id, back } : { kind: "issue", id };
  }
  return null;
}

function parseStapelSel(p: string[]): StapelSel {
  const [kind, a, b, c] = p;
  if (kind === "eintragen") return { kind: "import" };
  if (kind === "serien-ordnen") return { kind: "order" };
  if (kind === "reihenfolge") return { kind: "list" };
  const id = num(a);
  if (id === undefined) return null;
  if (kind === "jahr") {
    const issue = b === "heft" ? num(c) : undefined;
    return issue === undefined ? { kind: "year", year: id } : { kind: "year", year: id, issue };
  }
  if (kind === "serie") {
    if (b !== "alle") return { kind: "series", id };
    const sel = num(c);
    return sel === undefined ? { kind: "all", id } : { kind: "all", id, sel };
  }
  if (kind === "heft") {
    const series = num(c);
    if (series !== undefined && b === "serie") return { kind: "issue", id, series };
    if (series !== undefined && b === "alle") return { kind: "issue", id, series, fromAll: true };
    return { kind: "issue", id };
  }
  return null;
}

/** Reads a hash (with or without the leading #). Anything unknown falls back to the plan. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const tab = (TABS as string[]).includes(parts[0]) ? (parts[0] as Tab) : "plan";
  const p = tab === parts[0] ? parts.slice(1) : [];
  if (tab === "plan" || tab === "katalog") {
    const id = p[0] === "heft" ? num(p[1]) : undefined;
    return { tab, sel: id ?? null };
  }
  if (tab === "stapel") return { tab, sel: parseStapelSel(p) };
  // Serien: an optional sub tab first, then the selection.
  let sub: SerienTab = "serien";
  let rest = p;
  if (p[0] === "wunsch" || p[0] === "events") {
    sub = p[0];
    rest = p.slice(1);
  }
  // #serien/events/7 is short for the event itself.
  if (sub === "events" && num(rest[0]) !== undefined) return { tab, sub, sel: { kind: "event", id: num(rest[0])! } };
  const sel = parseSerienSel(rest);
  return { tab, sub: sel?.kind === "event" ? "events" : sub, sel };
}

function serienSelPath(s: SerienSel): string[] {
  if (!s) return [];
  if (s.kind === "event") return [String(s.id)];
  if (s.kind === "series") {
    if (s.found) found.set(s.id, s.found);
    return ["serie", String(s.id)];
  }
  if (s.kind === "all") return ["serie", String(s.id), "alle", ...(s.sel !== undefined ? [String(s.sel)] : [])];
  const back = s.back ? serienSelPath(s.back) : [];
  // heft/12/alle/4/12 rather than heft/12/serie/4/alle/12: the issue already says which series.
  if (back[2] === "alle") return ["heft", String(s.id), "alle", back[1], ...back.slice(3)];
  return ["heft", String(s.id), ...back];
}

function stapelSelPath(s: StapelSel): string[] {
  if (!s) return [];
  switch (s.kind) {
    case "import": return ["eintragen"];
    case "order": return ["serien-ordnen"];
    case "list": return ["reihenfolge"];
    case "year": return ["jahr", String(s.year), ...(s.issue !== undefined ? ["heft", String(s.issue)] : [])];
    case "series": return ["serie", String(s.id)];
    case "all": return ["serie", String(s.id), "alle", ...(s.sel !== undefined ? [String(s.sel)] : [])];
    case "issue": return ["heft", String(s.id), ...(s.series !== undefined ? [s.fromAll ? "alle" : "serie", String(s.series)] : [])];
  }
}

/** Writes a route as a hash, starting with #. */
export function formatRoute(r: Route): string {
  let p: string[];
  if (r.tab === "plan" || r.tab === "katalog") p = r.sel !== null ? ["heft", String(r.sel)] : [];
  else if (r.tab === "stapel") p = stapelSelPath(r.sel);
  else {
    const sel = serienSelPath(r.sel);
    // An event always sits on the events tab; the rest keeps the sub tab unless it is the default.
    if (r.sel?.kind === "event") p = ["events", ...sel];
    else p = [...(r.sub !== "serien" ? [r.sub] : []), ...sel];
  }
  return "#" + [r.tab, ...p].join("/");
}

// ---- Moving around. Each step is a history entry, so the back button walks back. ----

const CHANGE = "comics:route";

interface HistState { from?: string }

/** Goes to a route as a new history entry. */
export function navigate(r: Route | string) {
  const hash = typeof r === "string" ? r : formatRoute(r);
  if (hash === window.location.hash) return;
  const state: HistState = { from: window.location.hash || "#plan" };
  window.history.pushState(state, "", hash);
  window.dispatchEvent(new Event(CHANGE));
}

/** Swaps the current entry, e.g. when a detail closes and nothing to go back to. */
export function replaceRoute(r: Route | string) {
  const hash = typeof r === "string" ? r : formatRoute(r);
  if (hash === window.location.hash) return;
  window.history.replaceState(window.history.state, "", hash);
  window.dispatchEvent(new Event(CHANGE));
}

/**
 * Goes back to a route the way the back button would: if the entry before is
 * that route, it steps back, so closing a detail does not leave it behind as
 * a step to go back to again. Otherwise (opened from a link) it takes its place.
 */
export function backTo(r: Route | string) {
  const hash = typeof r === "string" ? r : formatRoute(r);
  const state = window.history.state as HistState | null;
  if (state?.from === hash) window.history.back();
  else replaceRoute(hash);
}

/** Calls back whenever the hash changes, by the app, a link, or the back button. */
export function onRouteChange(handler: () => void): () => void {
  window.addEventListener(CHANGE, handler);
  window.addEventListener("hashchange", handler);
  window.addEventListener("popstate", handler);
  return () => {
    window.removeEventListener(CHANGE, handler);
    window.removeEventListener("hashchange", handler);
    window.removeEventListener("popstate", handler);
  };
}
