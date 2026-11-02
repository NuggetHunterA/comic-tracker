// Reading statistics from the read issues: pure, so the tests can feed them by hand.
import { addDays, weekStart } from "./dates";

export interface ReadIssue {
  issueId: number;
  seriesId: number;
  /** Null when read before the app knew about it. */
  readOn: string | null;
  rating: number | null;
}

export interface SeriesScore {
  seriesId: number;
  avg: number;
  rated: number;
  /** The series' best issue, for the cover. */
  best: number;
}

export interface Stats {
  total: number;
  week: { start: string; count: number; days: { date: string; ids: number[] }[] };
  lastWeek: number;
  /** Oldest first; the last one is this week. */
  weeks: { start: string; count: number }[];
  month: number;
  year: number;
  /** Evenings in a row with at least one issue, up to today (or yesterday, tonight still open). */
  streak: number;
  avg: number | null;
  rated: number;
  /** Dated reads without a grade: the ones still worth rating. */
  unrated: number;
  topIssues: ReadIssue[];
  topSeries: SeriesScore[];
  /** Index 0 is grade 1. */
  grades: number[];
}

export const WEEKS = 12;
export const TOP = 5;
/** A series needs this many graded issues before it can rank; one 10 is not a series. */
export const MIN_RATED = 2;

export function readingStats(reads: ReadIssue[], today: string): Stats {
  const monday = weekStart(today);
  const dated = reads.filter((r): r is ReadIssue & { readOn: string } => !!r.readOn && r.readOn <= today);

  const perDay = new Map<string, number[]>();
  for (const r of dated) {
    if (!perDay.has(r.readOn)) perDay.set(r.readOn, []);
    perDay.get(r.readOn)!.push(r.issueId);
  }

  const days = Array.from({ length: 7 }, (_, k) => {
    const date = addDays(monday, k);
    return { date, ids: perDay.get(date) ?? [] };
  });
  const between = (from: string, to: string) => dated.filter((r) => r.readOn >= from && r.readOn < to).length;

  const weeks = Array.from({ length: WEEKS }, (_, k) => {
    const start = addDays(monday, -7 * (WEEKS - 1 - k));
    return { start, count: between(start, addDays(start, 7)) };
  });

  let streak = 0;
  let day = perDay.has(today) ? today : addDays(today, -1);
  while (perDay.has(day)) {
    streak++;
    day = addDays(day, -1);
  }

  const rated = reads.filter((r): r is ReadIssue & { rating: number } => r.rating !== null);
  const grades = Array.from({ length: 10 }, (_, k) => rated.filter((r) => r.rating === k + 1).length);
  const avg = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : null;

  // Best first; among equal grades the most recent read.
  const byGrade = [...rated].sort((a, b) => b.rating - a.rating || (b.readOn ?? "").localeCompare(a.readOn ?? "") || b.issueId - a.issueId);

  const bySeries = new Map<number, (ReadIssue & { rating: number })[]>();
  for (const r of byGrade) {
    if (!bySeries.has(r.seriesId)) bySeries.set(r.seriesId, []);
    bySeries.get(r.seriesId)!.push(r);
  }
  const topSeries = [...bySeries.entries()]
    .filter(([, list]) => list.length >= MIN_RATED)
    .map(([seriesId, list]) => ({ seriesId, avg: list.reduce((n, r) => n + r.rating, 0) / list.length, rated: list.length, best: list[0].issueId }))
    .sort((a, b) => b.avg - a.avg || b.rated - a.rated || a.seriesId - b.seriesId)
    .slice(0, TOP);

  return {
    total: reads.length,
    week: { start: monday, count: days.reduce((n, d) => n + d.ids.length, 0), days },
    lastWeek: between(addDays(monday, -7), monday),
    weeks,
    month: dated.filter((r) => r.readOn.slice(0, 7) === today.slice(0, 7)).length,
    year: dated.filter((r) => r.readOn.slice(0, 4) === today.slice(0, 4)).length,
    streak,
    avg,
    rated: rated.length,
    unrated: dated.filter((r) => r.rating === null).length,
    topIssues: byGrade.slice(0, TOP),
    topSeries,
    grades,
  };
}

/** "8,4": one decimal, German comma. */
export function gradeLabel(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
