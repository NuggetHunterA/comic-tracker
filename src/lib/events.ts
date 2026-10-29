// Events: cross-series reading orders kept by hand. Pure helpers; the store loads the rows.
import type { EventIssue, EventRow, Issue } from "./types";

/** The event colours. All carry toner-black text at 4.5:1 or better. */
export const EVENT_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "gelb", label: "Gelb", hex: "#ffd23f" },
  { id: "orange", label: "Orange", hex: "#ff9a3d" },
  { id: "rot", label: "Rot", hex: "#ff6b57" },
  { id: "pink", label: "Pink", hex: "#ff2e88" },
  { id: "rosa", label: "Rosa", hex: "#ffa3cf" },
  { id: "lila", label: "Lila", hex: "#b99cff" },
  { id: "blau", label: "Blau", hex: "#6cc4ff" },
  { id: "tuerkis", label: "Türkis", hex: "#3fe0c5" },
  { id: "gruen", label: "Grün", hex: "#97e36b" },
  { id: "papier", label: "Papier", hex: "#f6f5f0" },
];

export function eventHex(color: string): string {
  return (EVENT_COLORS.find((c) => c.id === color) ?? EVENT_COLORS[0]).hex;
}

/** "DC K.O." stays, "Absolute Power" becomes "Power": short enough for a cover strip. */
export function defaultShort(name: string): string {
  const n = name.trim();
  if (n.length <= 10) return n;
  const words = n.split(/\s+/);
  return words[words.length - 1].slice(0, 10);
}

const byDate = (a: Issue, b: Issue) =>
  (a.store_date ?? "9999").localeCompare(b.store_date ?? "9999") ||
  a.series_id - b.series_id ||
  (a.sort_number ?? 0) - (b.sort_number ?? 0) ||
  a.id - b.id;

/** An event's issues in reading order: by store date, or as sorted by hand. */
export function eventOrder(event: EventRow, links: EventIssue[], issues: Map<number, Issue>): Issue[] {
  const mine = links.filter((l) => l.event_id === event.id && issues.has(l.issue_id));
  if (event.manual_order) {
    return [...mine].sort((a, b) => a.position - b.position || byDate(issues.get(a.issue_id)!, issues.get(b.issue_id)!))
      .map((l) => issues.get(l.issue_id)!);
  }
  return mine.map((l) => issues.get(l.issue_id)!).sort(byDate);
}

/**
 * Where a new issue goes in an event sorted by hand: right after the last
 * issue that came out on or before it, so it still lands about right.
 */
export function insertAt(order: Issue[], issue: Issue): number {
  let at = 0;
  order.forEach((o, k) => {
    if (byDate(o, issue) <= 0) at = k + 1;
  });
  return at;
}

/** "Nightwing #128–132" style gaps: unread issues of a series before the event's issue. */
export function seriesGaps(
  order: Issue[],
  open: (i: Issue) => boolean,
  seriesIssues: Issue[],
): { seriesId: number; before: Issue; missing: Issue[] }[] {
  const out: { seriesId: number; before: Issue; missing: Issue[] }[] = [];
  const inEvent = new Set(order.map((i) => i.id));
  const seen = new Set<number>();
  for (const i of order) {
    if (!open(i) || seen.has(i.series_id) || i.sort_number === null) continue;
    const missing = seriesIssues
      .filter((s) => s.series_id === i.series_id && !inEvent.has(s.id) && open(s) && s.sort_number !== null && s.sort_number < i.sort_number!)
      .sort((a, b) => a.sort_number! - b.sort_number!);
    if (missing.length) {
      out.push({ seriesId: i.series_id, before: i, missing });
      seen.add(i.series_id);
    }
  }
  return out;
}
