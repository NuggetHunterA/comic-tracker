// Builds the reading plan. Pure: everything it needs comes in as arguments.
//
// Rules (from the concept):
// - Only readable issues are planned; unread ones roll over to the next evening.
// - Old pile first, then everything else.
// - A series is read in number order. Events (reading orders the reader keeps
//   across series) are read in one go, in event order; the plan switches
//   series only after an event. An event issue is read in event order even when
//   earlier issues of its series are still open; the series goes on after it.
// - Without an event a series is read in blocks of BLOCK_SIZE issues.
// - A started event (one of its issues read) comes first every evening, before
//   the old pile, as far as its issues are readable. At an issue that is not
//   readable yet it pauses, and the rest of the plan goes on as usual.
// - Pinned entries stay where the reader put them. A pin whose evening has
//   passed unread no longer counts; the issue goes back into the order.
//   Later issues of a pinned issue's series are not read before its evening.
// - Pinning an event issue starts the event there from its first open issue;
//   the later issues follow: same evening if there is room, otherwise first
//   thing on the next evenings.
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
}

export interface Pin {
  issueId: number;
  evening: string;
  slot: number;
}

export interface Evening {
  date: string;
  entries: { issueId: number; pinned: boolean }[];
}

export function readableFrom(
  storeDate: string | null,
  format: Format | null,
  boughtOn: string | null,
  infiniteDelayDays: number,
): string | null {
  if (format === "infinite") return storeDate ? addDays(storeDate, infiniteDelayDays) : null;
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

    let idx = 0;
    while (rotation.some((s) => nextOf(s))) {
      const seriesId = rotation[idx % rotation.length];
      idx++;
      const head = nextOf(seriesId);
      if (!head) continue;
      if (head.event) {
        for (const i of members.get(head.event.id)!) if (remaining.has(i.id)) take(i);
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

export function buildPlan(opts: {
  issues: PlanIssue[];
  pins: Pin[];
  today: string;
  maxPerEvening: number;
  blockSize?: number;
  /** Started events (an issue already read), most urgent first. */
  startedEvents?: number[];
}): Evening[] {
  const { today, maxPerEvening } = opts;
  const pins = eventHeadPins(opts.issues, opts.pins.filter((p) => p.evening >= today));
  const pinned = new Set(pins.map((p) => p.issueId));
  const pinsByDay = new Map<string, Pin[]>();
  for (const p of pins) {
    if (!pinsByDay.has(p.evening)) pinsByDay.set(p.evening, []);
    pinsByDay.get(p.evening)!.push(p);
  }
  let followers = eventFollowers(opts.issues, pins, pinned);
  const following = new Set(followers.map((f) => f.issue.id));
  const members = eventMembers(opts.issues);
  let started = (opts.startedEvents ?? []).flatMap((e) =>
    (members.get(e) ?? []).filter((i) => !pinned.has(i.id) && !following.has(i.id)),
  );
  const early = new Set(started.map((i) => i.id));
  let queue = readingQueue(
    opts.issues.filter((i) => !pinned.has(i.id) && !following.has(i.id) && !early.has(i.id)),
    opts.blockSize,
  );
  const lastPinDay = [...pinsByDay.keys()].sort().pop() ?? today;
  const notBefore = notBeforePins(opts.issues, pins, pinned);

  const evenings: Evening[] = [];
  for (let d = 0; d <= HORIZON_DAYS; d++) {
    const date = addDays(today, d);
    const dayPins = (pinsByDay.get(date) ?? []).sort((a, b) => a.slot - b.slot);
    const entries = dayPins.map((p) => ({ issueId: p.issueId, pinned: true }));
    const capacity = Math.max(0, maxPerEvening - entries.length);
    const canRead = (i: PlanIssue) => (notBefore.get(i.id) ?? "") <= date && i.readableFrom !== null && i.readableFrom <= date;

    const placed = new Set<number>();
    const place = (i: PlanIssue) => {
      placed.add(i.id);
      entries.push({ issueId: i.id, pinned: false });
    };
    const blockedSeries = new Set<number>();
    const blockedEvents = new Set<number>();
    // A paused event holds back the later issues of its waiting issue's series.
    const seriesFrom = new Map<number, PlanIssue>();
    const blockedFollowEvents = new Set<number>();
    for (const f of followers) {
      if (placed.size >= capacity) break;
      if (f.from > date || blockedFollowEvents.has(f.eventId)) continue;
      if (canRead(f.issue)) place(f.issue);
      else {
        blockedFollowEvents.add(f.eventId);
        blockedSeries.add(f.issue.seriesId);
      }
    }
    for (const i of started) {
      if (placed.size >= capacity) break;
      if (blockedEvents.has(i.event!.id)) continue;
      if (canRead(i)) place(i);
      else {
        blockedEvents.add(i.event!.id);
        const was = seriesFrom.get(i.seriesId);
        if (!was || byNumber(i, was) < 0) seriesFrom.set(i.seriesId, i);
      }
    }
    for (const i of queue) {
      if (placed.size >= capacity) break;
      const from = seriesFrom.get(i.seriesId);
      const blocked =
        blockedSeries.has(i.seriesId) ||
        (from !== undefined && byNumber(from, i) < 0) ||
        (i.event !== null && blockedEvents.has(i.event.id));
      if (!blocked && canRead(i)) place(i);
      else {
        blockedSeries.add(i.seriesId);
        if (i.event) blockedEvents.add(i.event.id);
      }
    }
    queue = queue.filter((i) => !placed.has(i.id));
    followers = followers.filter((f) => !placed.has(f.issue.id));
    started = started.filter((i) => !placed.has(i.id));
    if (entries.length || d === 0) evenings.push({ date, entries });
    const anyPlaceable = [...queue, ...started, ...followers.map((f) => f.issue)].some((i) => i.readableFrom !== null);
    if (!anyPlaceable && date >= lastPinDay) break;
  }
  return evenings;
}

/**
 * A pin on an event issue starts the event there: the pin moves to the
 * event's first open issue, if that one is readable by then. The issue the
 * reader pinned follows it like the rest of the event.
 */
function eventHeadPins(issues: PlanIssue[], pins: Pin[]): Pin[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const members = eventMembers(issues);
  const pinnedIds = new Set(pins.map((p) => p.issueId));
  const done = new Set<number>();
  const ordered = [...pins].sort((a, b) => a.evening.localeCompare(b.evening) || a.slot - b.slot);
  return ordered.map((p) => {
    const ev = byId.get(p.issueId)?.event;
    if (!ev || done.has(ev.id)) return p;
    done.add(ev.id);
    const head = members.get(ev.id)!.find((i) => !pinnedIds.has(i.id) || i.id === p.issueId)!;
    if (head.id === p.issueId || head.event!.position > ev.position) return p;
    if (head.readableFrom === null || head.readableFrom > p.evening) return p;
    return { ...p, issueId: head.id };
  });
}

/**
 * Later issues of the events that pinned issues belong to, in pin order, then
 * event order. Each may not be read before the evening its pin is on.
 */
function eventFollowers(issues: PlanIssue[], pins: Pin[], pinned: Set<number>) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const members = eventMembers(issues);
  const out: { issue: PlanIssue; eventId: number; from: string }[] = [];
  const taken = new Set<number>();
  const ordered = [...pins].sort((a, b) => a.evening.localeCompare(b.evening) || a.slot - b.slot);
  for (const p of ordered) {
    const ev = byId.get(p.issueId)?.event;
    if (!ev) continue;
    for (const i of members.get(ev.id)!) {
      if (pinned.has(i.id) || taken.has(i.id) || i.event!.position <= ev.position) continue;
      taken.add(i.id);
      out.push({ issue: i, eventId: ev.id, from: p.evening });
    }
  }
  return out;
}

/** For unpinned issues: the latest evening an earlier issue of the same series is pinned to. */
function notBeforePins(issues: PlanIssue[], pins: Pin[], pinned: Set<number>) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const out = new Map<number, string>();
  for (const p of pins) {
    const head = byId.get(p.issueId);
    if (!head) continue;
    for (const i of issues) {
      if (pinned.has(i.id) || i.seriesId !== head.seriesId || byNumber(head, i) >= 0) continue;
      if (p.evening > (out.get(i.id) ?? "")) out.set(i.id, p.evening);
    }
  }
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
