// Builds the reading plan. Pure: everything it needs comes in as arguments.
//
// The plan is a saved reading list, read top to bottom. It is sorted by the
// rules only when the reader asks for it or changes the rules (events);
// reading an issue never reorders it.
//
// Sort rules:
// - Old pile first, then everything else.
// - A series is read in number order. Events (reading orders the reader keeps
//   across series) are read in one go, in event order; the plan switches
//   series only after an event. An event issue is read in event order even when
//   earlier issues of its series are still open; the series goes on after it.
// - Without an event a series is read in blocks of BLOCK_SIZE issues.
// - Series take turns by date: the one whose oldest open issue came out
//   first goes first, so after a block of it another series comes up.
// - A started event (one of its issues read) goes first.
// - Issues moved by hand keep their place.
//
// Between sorts, new issues are slotted in next to their series or event and
// nothing else moves. Evenings take the list in order, as far as issues are
// readable; unread ones roll over to the next evening. An evening keeps to one
// publisher: the first issue sets it, issues of the other publisher wait for
// an evening of their own, unless nothing of this publisher is left to read
// or they were moved there by hand.
//
// Archive issues (taken from the Archivkiste) only fill what is left: each
// evening takes its other issues first, archive issues get the empty places,
// keeping to the evening's publisher. Moved by hand, they count like any other.
import { addDays } from "./dates";
import type { Format } from "./types";

export const BLOCK_SIZE = 4;
const HORIZON_DAYS = 120;

export interface PlanIssue {
  id: number;
  seriesId: number;
  sortNumber: number | null;
  storeDate: string | null;
  oldPile: boolean;
  /** First evening the issue can be read, or null when unknown (not bought, no date). */
  readableFrom: string | null;
  /** The event the issue belongs to and its place in it, or null. */
  event: { id: number; position: number } | null;
  /** Its publisher; an evening keeps to one. Unset: never holds an evening to one. */
  publisher?: string;
  /** From the Archivkiste: only fills places no other issue takes. */
  archive?: boolean;
}

export interface Evening {
  date: string;
  /** pinned: moved to its place in the list by hand. */
  entries: { issueId: number; pinned: boolean }[];
}

export function readableFrom(
  storeDate: string | null,
  format: Format | null,
  boughtOn: string | null,
  infiniteDelayDays: number,
  webtoonDelayDays = infiniteDelayDays,
): string | null {
  if (format === "infinite") return storeDate ? addDays(storeDate, infiniteDelayDays) : null;
  if (format === "webtoon") return storeDate ? addDays(storeDate, webtoonDelayDays) : null;
  if (format === "print") return boughtOn;
  return null;
}

const byNumber = (a: PlanIssue, b: PlanIssue) =>
  (a.sortNumber ?? Infinity) - (b.sortNumber ?? Infinity) ||
  (a.storeDate ?? "9999").localeCompare(b.storeDate ?? "9999") ||
  a.id - b.id;

/** Orders issues the way they should be read, ignoring dates. */
export function readingQueue(issues: PlanIssue[], blockSize = BLOCK_SIZE): PlanIssue[] {
  const remaining = new Map(issues.map((i) => [i.id, i]));
  const members = eventMembers(issues);

  const out: PlanIssue[] = [];
  const take = (i: PlanIssue) => {
    if (!remaining.delete(i.id)) return;
    out.push(i);
  };

  for (const old of [true, false]) {
    const group = issues.filter((i) => i.oldPile === old);
    const bySeries = new Map<number, PlanIssue[]>();
    for (const i of [...group].sort(byNumber)) {
      if (!bySeries.has(i.seriesId)) bySeries.set(i.seriesId, []);
      bySeries.get(i.seriesId)!.push(i);
    }
    const firstDate = (list: PlanIssue[]) => list.reduce((m, i) => (i.storeDate && i.storeDate < m ? i.storeDate : m), "9999");
    const rotation = [...bySeries.keys()].sort(
      (a, b) => firstDate(bySeries.get(a)!).localeCompare(firstDate(bySeries.get(b)!)) || a - b,
    );
    const nextOf = (s: number) => bySeries.get(s)!.find((i) => remaining.has(i.id));
    const takeEvent = (eventId: number) => {
      for (const i of members.get(eventId)!) if (remaining.has(i.id)) take(i);
    };

    let idx = 0;
    while (rotation.some((s) => nextOf(s))) {
      const seriesId = rotation[idx % rotation.length];
      idx++;
      const head = nextOf(seriesId);
      if (!head) continue;
      if (head.event) {
        takeEvent(head.event.id);
        continue;
      }
      // No event: a block of this series, stopping before the next event starts.
      let n = 0;
      for (let i = nextOf(seriesId); i && n < blockSize; i = nextOf(seriesId)) {
        if (n > 0 && i.event) break;
        take(i);
        n++;
      }
    }
  }
  return out;
}

/** Each event's issues, in event order. */
function eventMembers(issues: PlanIssue[]): Map<number, PlanIssue[]> {
  const out = new Map<number, PlanIssue[]>();
  for (const i of issues) {
    if (!i.event) continue;
    if (!out.has(i.event.id)) out.set(i.event.id, []);
    out.get(i.event.id)!.push(i);
  }
  for (const list of out.values()) list.sort((a, b) => a.event!.position - b.event!.position);
  return out;
}

/** One place in the reading list. manual: moved there by hand; added: slotted in since the last sort. */
export interface ListEntry {
  issueId: number;
  manual: boolean;
  added: boolean;
}

/** What a full sort goes by. */
export interface ListRules {
  blockSize?: number;
  /** Started events (an issue already read), most urgent first. */
  startedEvents?: number[];
}

/**
 * Sorts the whole list by the rules: started events first, then the reading
 * queue. Entries moved by hand keep their place in the list.
 */
export function sortList(issues: PlanIssue[], rules: ListRules = {}, keep: ListEntry[] = []): ListEntry[] {
  const open = new Set(issues.map((i) => i.id));
  const manual = keep.map((e, k) => ({ e, k })).filter(({ e }) => e.manual && open.has(e.issueId));
  const fixed = new Set(manual.map(({ e }) => e.issueId));
  const members = eventMembers(issues);
  const started = (rules.startedEvents ?? []).flatMap((e) => (members.get(e) ?? []).filter((i) => !fixed.has(i.id)));
  const early = new Set(started.map((i) => i.id));
  const rest = readingQueue(issues.filter((i) => !fixed.has(i.id) && !early.has(i.id)), rules.blockSize);
  const out: ListEntry[] = [...started, ...rest].map((i) => ({ issueId: i.id, manual: false, added: false }));
  for (const { e, k } of manual) out.splice(Math.min(k, out.length), 0, { issueId: e.issueId, manual: true, added: false });
  return out;
}

/**
 * Brings the saved list up to date without moving what is already in it:
 * issues no longer open drop out, new ones are slotted in (see slotFor).
 * An empty list is sorted from scratch.
 */
export function syncList(stored: ListEntry[], issues: PlanIssue[], rules: ListRules = {}): ListEntry[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const out = stored.filter((e) => byId.has(e.issueId));
  if (out.length === 0) return sortList(issues, rules);
  const listed = new Set(out.map((e) => e.issueId));
  for (const i of issues.filter((x) => !listed.has(x.id)).sort(byNumber)) {
    out.splice(slotFor(out, i, byId), 0, { issueId: i.id, manual: false, added: true });
  }
  return out;
}

/**
 * Where a new issue goes: next to its event's neighbours; else in number
 * order among its series; else (old pile) after the old pile; else at the end.
 */
function slotFor(list: ListEntry[], i: PlanIssue, byId: Map<number, PlanIssue>): number {
  const of = (e: ListEntry) => byId.get(e.issueId)!;
  const first = (f: (x: PlanIssue) => boolean) => list.findIndex((e) => f(of(e)));
  const last = (f: (x: PlanIssue) => boolean) => {
    for (let k = list.length - 1; k >= 0; k--) if (f(of(list[k]))) return k;
    return -1;
  };
  if (i.event) {
    const ev = i.event;
    const before = last((x) => x.event?.id === ev.id && x.event.position < ev.position);
    if (before >= 0) return before + 1;
    const after = first((x) => x.event?.id === ev.id);
    if (after >= 0) return after;
  }
  const later = first((x) => x.seriesId === i.seriesId && byNumber(i, x) < 0);
  if (later >= 0) return later;
  const earlier = last((x) => x.seriesId === i.seriesId);
  if (earlier >= 0) return earlier + 1;
  if (i.oldPile) {
    const fresh = first((x) => !x.oldPile);
    if (fresh >= 0) return fresh;
  }
  return list.length;
}

/**
 * Lays the list out on evenings, top to bottom, up to maxPerEvening each.
 * An issue that is not readable yet waits, and so do the issues after it in
 * its series and its event; the rest of the list goes on. Issues read today
 * count toward tonight, so nothing moves up when one is read.
 */
export function planEvenings(opts: {
  list: ListEntry[];
  issues: PlanIssue[];
  today: string;
  maxPerEvening: number;
  readToday?: number;
  /** The publisher of what was read today, so the rest of tonight keeps to it. */
  readTodayPublisher?: string;
}): Evening[] {
  const { today, maxPerEvening } = opts;
  const byId = new Map(opts.issues.map((i) => [i.id, i]));
  let rest = opts.list.filter((e) => byId.has(e.issueId));
  const evenings: Evening[] = [];
  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const date = addDays(today, d);
    const capacity = Math.max(0, maxPerEvening - (d === 0 ? opts.readToday ?? 0 : 0));
    const entries: Evening["entries"] = [];
    const placed = new Set<number>();
    let publisher = d === 0 ? opts.readTodayPublisher : undefined;
    // First the evening's own publisher, then (if room is left) whatever else is readable;
    // archive issues last, and only of the evening's publisher.
    for (const pass of ["strict", "loose", "archive"] as const) {
      const strict = pass !== "loose";
      const blockedSeries = new Set<number>();
      const blockedEvents = new Set<number>();
      for (const e of rest) {
        if (entries.length >= capacity) break;
        if (placed.has(e.issueId)) continue;
        const i = byId.get(e.issueId)!;
        const filler = !!i.archive && !e.manual;
        if (filler !== (pass === "archive")) continue;
        const blocked = blockedSeries.has(i.seriesId) || (i.event !== null && blockedEvents.has(i.event.id));
        const readable = !blocked && i.readableFrom !== null && i.readableFrom <= date;
        const fits = !strict || e.manual || !i.publisher || publisher === undefined || i.publisher === publisher;
        if (readable && fits) {
          entries.push({ issueId: i.id, pinned: e.manual });
          placed.add(i.id);
          if (publisher === undefined && !e.manual && i.publisher) publisher = i.publisher;
        } else {
          blockedSeries.add(i.seriesId);
          if (i.event) blockedEvents.add(i.event.id);
        }
      }
    }
    // Keep list order within the evening.
    const at = new Map(rest.map((e, k) => [e.issueId, k]));
    entries.sort((a, b) => at.get(a.issueId)! - at.get(b.issueId)!);
    rest = rest.filter((e) => !placed.has(e.issueId));
    if (entries.length || d === 0) evenings.push({ date, entries });
    if (!rest.some((e) => byId.get(e.issueId)!.readableFrom !== null)) break;
  }
  return evenings;
}

/**
 * Rewrites a freshly sorted list in the order the evenings read it, so the list
 * shows what the plan does: an issue pulled forward to fill an evening of its
 * publisher stands next to the others of that evening. Issues no evening takes
 * (no reading date yet) stay right after the issue they followed before.
 */
export function alignToEvenings(list: ListEntry[], evenings: Evening[]): ListEntry[] {
  const byId = new Map(list.map((e) => [e.issueId, e]));
  const out: ListEntry[] = [];
  for (const ev of evenings) for (const x of ev.entries) {
    const e = byId.get(x.issueId);
    if (e) out.push(e);
  }
  const placed = new Set(out.map((e) => e.issueId));
  list.forEach((e, k) => {
    if (placed.has(e.issueId)) return;
    let at = 0;
    for (let j = k - 1; j >= 0; j--) {
      const prev = out.findIndex((x) => x.issueId === list[j].issueId);
      if (prev >= 0) { at = prev + 1; break; }
    }
    out.splice(at, 0, e);
    placed.add(e.issueId);
  });
  return out;
}

/** Hands an issue moved by hand back to the rules: it goes where a new issue would go. */
export function releaseInList(list: ListEntry[], issueId: number, issues: PlanIssue[]): ListEntry[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const i = byId.get(issueId);
  const out = list.filter((e) => e.issueId !== issueId && byId.has(e.issueId));
  if (!i) return out;
  out.splice(slotFor(out, i, byId), 0, { issueId, manual: false, added: false });
  return out;
}

/** Moves one issue to a place in the list; it stays there through later sorts. */
export function moveInList(list: ListEntry[], issueId: number, to: number): ListEntry[] {
  const out = list.filter((e) => e.issueId !== issueId);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, { issueId, manual: true, added: false });
  return out;
}

/**
 * Series that stall because their next issue has no reading date (print not
 * bought, no store date): that issue and how many later ones wait behind it.
 */
export function stalledSeries(issues: PlanIssue[]): { issue: PlanIssue; behind: number }[] {
  const bySeries = new Map<number, PlanIssue[]>();
  for (const i of [...issues].sort(byNumber)) {
    if (!bySeries.has(i.seriesId)) bySeries.set(i.seriesId, []);
    bySeries.get(i.seriesId)!.push(i);
  }
  const out: { issue: PlanIssue; behind: number }[] = [];
  for (const list of bySeries.values()) {
    const k = list.findIndex((i) => i.readableFrom === null);
    if (k >= 0 && k < list.length - 1) out.push({ issue: list[k], behind: list.length - 1 - k });
  }
  return out;
}
