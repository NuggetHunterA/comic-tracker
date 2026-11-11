// The reading year for the Jahreswand: every dated read of one year, its numbers
// for the flyer and the fun facts on its tear-off slips. Pure, so tests feed it by hand.
import { addDays, fromIso } from "./dates";
import type { Verlag } from "./publisher";

export interface YearRead {
  issueId: number;
  seriesId: number;
  /** Issue number as printed, and its sort value for runs. */
  number: string;
  sortNumber: number | null;
  readOn: string;
  rating: number | null;
  storeDate: string | null;
  verlag: Verlag;
}

export interface YearMonth {
  /** 0 is January. */
  month: number;
  /** In reading order: by date, then as they were read in the list. */
  reads: YearRead[];
}

export interface Fact {
  key: string;
  label: string;
  text: string;
}

export interface YearStats {
  year: number;
  count: number;
  evenings: number;
  /** Most evenings in a row with at least one issue. */
  longestRun: number;
  first: string | null;
  /** True while the year is still running. */
  open: boolean;
  months: YearMonth[];
  top: number[];
  bestSeries: { seriesId: number; avg: number; rated: number } | null;
  bestIssue: YearRead | null;
  strongestMonth: { month: number; count: number } | null;
  dc: number;
  marvel: number;
  facts: Fact[];
}

export const TOP_WALL = 5;
const MIN_RATED = 2;
/** A regular issue: about 22 story pages, 2.5 mm thick. */
const PAGES = 22;
const MM = 2.5;
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** Years with at least one dated read, newest first. */
export function readingYears(readOns: (string | null)[], today: string): number[] {
  const ys = new Set<number>();
  for (const d of readOns) if (d && d <= today) ys.add(Number(d.slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

const hefte = (n: number) => (n === 1 ? "1 Heft" : `${n} Hefte`);
const abende = (n: number) => (n === 1 ? "1 Abend" : `${n} Abenden`);
/** "30. Oktober" */
export const longDate = (iso: string) => `${fromIso(iso).getDate()}. ${MONTH_NAMES[fromIso(iso).getMonth()]}`;

function monthsBetween(from: string, to: string): number {
  const a = fromIso(from);
  const b = fromIso(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
}

/** "1 Jahr und 9 Monate", "5 Monate", "2 Jahre" */
function spanLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 1 ? "1 Jahr" : `${y} Jahre`;
  const ms = m === 1 ? "1 Monat" : `${m} Monate`;
  if (y === 0) return ms;
  if (m === 0) return ys;
  return `${ys} und ${ms}`;
}

/**
 * Builds the year. `reads` may hold any reads; only dated ones of `year` up to
 * today count. Their order in the array is kept within a day, so pass them as
 * they were read. `seriesName` names a series in the fun facts.
 */
export function yearStats(reads: YearRead[], year: number, today: string, seriesName: (id: number) => string): YearStats {
  const y = String(year);
  const list = reads.map((r, k) => ({ r, k })).filter(({ r }) => r.readOn.slice(0, 4) === y && r.readOn <= today)
    .sort((a, b) => a.r.readOn.localeCompare(b.r.readOn) || a.k - b.k).map(({ r }) => r);
  const open = today.slice(0, 4) === y;

  const perDay = new Map<string, YearRead[]>();
  for (const r of list) {
    if (!perDay.has(r.readOn)) perDay.set(r.readOn, []);
    perDay.get(r.readOn)!.push(r);
  }
  const days = [...perDay.keys()].sort();
  let longestRun = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  }

  // Months from the first one read in to the last one of the year (or this one, while it runs).
  const months: YearMonth[] = [];
  if (list.length) {
    const firstM = Number(list[0].readOn.slice(5, 7)) - 1;
    const lastM = open ? Number(today.slice(5, 7)) - 1 : 11;
    for (let m = firstM; m <= lastM; m++) months.push({ month: m, reads: list.filter((r) => Number(r.readOn.slice(5, 7)) - 1 === m) });
  }
  const strongest = months.reduce<YearMonth | null>((best, m) => (m.reads.length > (best?.reads.length ?? 0) ? m : best), null);

  // Best first; on a tie the newer read, as in the Bilanz.
  const rated = list.filter((r): r is YearRead & { rating: number } => r.rating !== null);
  const byGrade = [...rated].sort((a, b) => b.rating - a.rating || b.readOn.localeCompare(a.readOn) || b.issueId - a.issueId);
  const bySeries = new Map<number, number[]>();
  for (const r of rated) bySeries.set(r.seriesId, [...(bySeries.get(r.seriesId) ?? []), r.rating]);
  const bestSeries = [...bySeries.entries()].filter(([, g]) => g.length >= MIN_RATED)
    .map(([seriesId, g]) => ({ seriesId, avg: g.reduce((n, x) => n + x, 0) / g.length, rated: g.length }))
    .sort((a, b) => b.avg - a.avg || b.rated - a.rated || a.seriesId - b.seriesId)[0] ?? null;

  const facts: Fact[] = [];
  if (list.length) {
    // Rekordabend: the evening with the most issues, the earliest on a tie.
    const [recDay, rec] = [...perDay.entries()].reduce((best, e) => (e[1].length > best[1].length ? e : best));
    const recSeries = new Set(rec.map((r) => r.seriesId));
    const what = recSeries.size === 1 && rec.length > 1
      ? `${seriesName(rec[0].seriesId)} #${sorted(rec)[0].number} bis #${sorted(rec)[rec.length - 1].number}`
      : `${recSeries.size} ${recSeries.size === 1 ? "Serie" : "Serien"}`;
    facts.push({ key: "rekord", label: "Rekordabend", text: `${hefte(rec.length)} an einem Abend: ${what}, ${DAY_NAMES[fromIso(recDay).getDay()]}, ${longDate(recDay)}.` });

    // Lieblingstag: the weekday with the most issues.
    const perWd = Array(7).fill(0) as number[];
    for (const r of list) perWd[fromIso(r.readOn).getDay()]++;
    const wd = perWd.indexOf(Math.max(...perWd));
    const second = Math.max(...perWd.filter((_, k) => k !== wd));
    if (days.length >= 3 && perWd[wd] > second) facts.push({ key: "tag", label: "Lieblingstag", text: `${DAY_NAMES[wd]}. ${hefte(perWd[wd])}, mehr als an jedem anderen Wochentag.` });

    // Am Stück: the series read most this year, its first and last number and the evenings it took.
    const ofSeries = new Map<number, YearRead[]>();
    for (const r of list) ofSeries.set(r.seriesId, [...(ofSeries.get(r.seriesId) ?? []), r]);
    const [sid, sr] = [...ofSeries.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
    if (sr.length >= 3) {
      const s = sorted(sr);
      const eves = new Set(sr.map((r) => r.readOn)).size;
      facts.push({ key: "stueck", label: "Am Stück", text: `${seriesName(sid)} #${s[0].number} bis #${s[s.length - 1].number}: ${hefte(sr.length)} an ${abende(eves)}.` });
    }

    // Stapelhöhe: a rough measure, so it says so.
    const cm = Math.round((list.length * MM) / 10);
    const pages = Math.round((list.length * PAGES) / 10) * 10;
    facts.push({ key: "stapel", label: "Stapelhöhe", text: `Rund ${pages.toLocaleString("de-DE")} Comicseiten. Gestapelt etwa ${cm < 1 ? "einen halben" : cm} cm Papier.` });

    // Zeitreise: how long after release, and the oldest issue read.
    const dated = list.filter((r): r is YearRead & { storeDate: string } => !!r.storeDate && r.storeDate <= r.readOn);
    if (dated.length) {
      const avg = Math.round(dated.reduce((n, r) => n + monthsBetween(r.storeDate, r.readOn), 0) / dated.length);
      const oldest = dated.reduce((o, r) => (r.storeDate < o.storeDate ? r : o));
      const when = `${MONTH_NAMES[fromIso(oldest.storeDate).getMonth()]} ${oldest.storeDate.slice(0, 4)}`;
      facts.push({
        key: "zeit", label: "Zeitreise",
        text: avg < 1
          ? `Du liest frisch: im Schnitt weniger als einen Monat nach Erscheinen. Das älteste: ${seriesName(oldest.seriesId)} #${oldest.number} vom ${when}.`
          : `Im Schnitt hast du ein Heft ${spanLabel(avg)} nach Erscheinen gelesen. Das älteste: ${seriesName(oldest.seriesId)} #${oldest.number} vom ${when}.`,
      });
    }

    // Ohne Note: a nudge, or a pat on the back.
    const unrated = list.length - rated.length;
    facts.push({ key: "note", label: "Ohne Note", text: unrated > 0
      ? `${unrated === 1 ? "1 Heft hat" : `${unrated} Hefte haben`} noch keine Note. Tipp ein Cover an der Wand an, um sie nachzutragen.`
      : "Jedes Heft hat eine Note. Sauber." });
  }

  return {
    year,
    count: list.length,
    evenings: days.length,
    longestRun,
    first: list[0]?.readOn ?? null,
    open,
    months,
    top: byGrade.slice(0, TOP_WALL).map((r) => r.issueId),
    bestSeries,
    bestIssue: byGrade[0] ?? null,
    strongestMonth: strongest && strongest.reads.length ? { month: strongest.month, count: strongest.reads.length } : null,
    dc: list.filter((r) => r.verlag === "dc").length,
    marvel: list.filter((r) => r.verlag === "marvel").length,
    facts,
  };
}

function sorted(rs: YearRead[]): YearRead[] {
  return [...rs].sort((a, b) => (a.sortNumber ?? 0) - (b.sortNumber ?? 0));
}

export { MONTH_NAMES };
