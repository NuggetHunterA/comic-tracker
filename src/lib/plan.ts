// Builds the reading plan. Pure: everything it needs comes in as arguments.
//
// Rules (from the concept):
// - Only readable issues are planned; unread ones roll over to the next evening.
// - Old pile first, then everything else.
// - A series is read in number order. Story arcs are read in one go, in arc
//   order (crossovers included); the plan switches series only after an arc.
// - Without arc data a series is read in blocks of BLOCK_SIZE issues.
// - Pinned entries stay where the reader put them. A pin whose evening has
//   passed unread no longer counts; the issue goes back into the order.
//   Later issues of a pinned issue's series are not read before its evening.
// - The later parts of a pinned issue's arc follow it: same evening if there
//   is room, otherwise first thing on the next evenings.
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
  arcs: { arcId: number; position: number }[];
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
  const arcMembers = new Map<number, PlanIssue[]>();
  for (const i of issues) {
    for (const a of i.arcs) {
      if (!arcMembers.has(a.arcId)) arcMembers.set(a.arcId, []);
      arcMembers.get(a.arcId)!.push(i);
    }
  }
  const arcPos = (i: PlanIssue, arcId: number) => i.arcs.find((a) => a.arcId === arcId)!.position;
  for (const [arcId, list] of arcMembers) list.sort((a, b) => arcPos(a, arcId) - arcPos(b, arcId));

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
      const arc = pickArc(head, arcMembers, remaining);
      if (arc !== null) {
        for (const i of arcMembers.get(arc)!) if (remaining.has(i.id)) take(i);
        continue;
      }
      // No arc: a block of this series, stopping before the next arc starts.
      let n = 0;
      for (let i = nextOf(seriesId); i && n < blockSize; i = nextOf(seriesId)) {
        if (n > 0 && pickArc(i, arcMembers, remaining) !== null) break;
        take(i);
        n++;
      }
    }
  }
  return out;
}

function pickArc(issue: PlanIssue, arcMembers: Map<number, PlanIssue[]>, remaining: Map<number, PlanIssue>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const a of issue.arcs) {
    const count = arcMembers.get(a.arcId)!.filter((i) => remaining.has(i.id)).length;
    if (count > bestCount) {
      best = a.arcId;
      bestCount = count;
    }
  }
  return best;
}

export function buildPlan(opts: {
  issues: PlanIssue[];
  pins: Pin[];
  today: string;
  maxPerEvening: number;
  blockSize?: number;
}): Evening[] {
  const { today, maxPerEvening } = opts;
  const pins = opts.pins.filter((p) => p.evening >= today);
  const pinned = new Set(pins.map((p) => p.issueId));
  const pinsByDay = new Map<string, Pin[]>();
  for (const p of pins) {
    if (!pinsByDay.has(p.evening)) pinsByDay.set(p.evening, []);
    pinsByDay.get(p.evening)!.push(p);
  }
  let followers = arcFollowers(opts.issues, pins, pinned);
  let queue = readingQueue(
    opts.issues.filter((i) => !pinned.has(i.id) && !followers.some((f) => f.issue.id === i.id)),
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

    const placed = new Set<number>();
    const blockedSeries = new Set<number>();
    const blockedArcs = new Set<number>();
    const blockedFollowArcs = new Set<number>();
    for (const f of followers) {
      if (placed.size >= capacity) break;
      if (f.from > date || blockedFollowArcs.has(f.arcId)) continue;
      if ((notBefore.get(f.issue.id) ?? "") > date) {
        blockedFollowArcs.add(f.arcId);
        blockedSeries.add(f.issue.seriesId);
        continue;
      }
      if (f.issue.readableFrom !== null && f.issue.readableFrom <= date) {
        placed.add(f.issue.id);
        entries.push({ issueId: f.issue.id, pinned: false });
      } else {
        blockedFollowArcs.add(f.arcId);
        blockedSeries.add(f.issue.seriesId);
      }
    }
    for (const i of queue) {
      if (placed.size >= capacity) break;
      const blocked =
        blockedSeries.has(i.seriesId) ||
        i.arcs.some((a) => blockedArcs.has(a.arcId)) ||
        (notBefore.get(i.id) ?? "") > date;
      if (!blocked && i.readableFrom !== null && i.readableFrom <= date) {
        placed.add(i.id);
        entries.push({ issueId: i.id, pinned: false });
      } else {
        blockedSeries.add(i.seriesId);
        for (const a of i.arcs) blockedArcs.add(a.arcId);
      }
    }
    queue = queue.filter((i) => !placed.has(i.id));
    followers = followers.filter((f) => !placed.has(f.issue.id));
    if (entries.length || d === 0) evenings.push({ date, entries });
    const anyPlaceable = queue.some((i) => i.readableFrom !== null) || followers.some((f) => f.issue.readableFrom !== null);
    if (!anyPlaceable && date >= lastPinDay) break;
  }
  return evenings;
}

/**
 * Later parts of the arcs that pinned issues belong to, in pin order, then arc
 * order. Each may not be read before the evening its pin is on.
 */
function arcFollowers(issues: PlanIssue[], pins: Pin[], pinned: Set<number>) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const out: { issue: PlanIssue; arcId: number; from: string }[] = [];
  const taken = new Set<number>();
  const ordered = [...pins].sort((a, b) => a.evening.localeCompare(b.evening) || a.slot - b.slot);
  for (const p of ordered) {
    const head = byId.get(p.issueId);
    if (!head) continue;
    for (const a of head.arcs) {
      const later = issues
        .filter((i) => !pinned.has(i.id) && !taken.has(i.id))
        .map((i) => ({ i, pos: i.arcs.find((x) => x.arcId === a.arcId)?.position }))
        .filter((x): x is { i: PlanIssue; pos: number } => x.pos !== undefined && x.pos > a.position)
        .sort((x, y) => x.pos - y.pos);
      for (const { i } of later) {
        taken.add(i.id);
        out.push({ issue: i, arcId: a.arcId, from: p.evening });
      }
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
