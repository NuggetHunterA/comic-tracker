import type { Format, Issue, Series } from "./types";

export const FORMAT_LABEL: Record<Format, string> = { print: "Print", infinite: "Infinite" };

export function seriesTitle(s: Series | undefined): string {
  if (!s) return "Unbekannte Serie";
  return s.name;
}

/** Name plus start year, used where two volumes could be confused. */
export function seriesLong(s: Series | undefined): string {
  if (!s) return "Unbekannte Serie";
  return s.year_began ? `${s.name} (${s.year_began})` : s.name;
}

export function issueTitle(issue: Issue, series: Series | undefined): string {
  return `${seriesTitle(series)} #${issue.number}`;
}

/** "Batman #155–157, Nightwing #113" for a reading order. */
export function runsLabel(list: { issue: Issue; series: Series | undefined }[]): string {
  const runs: { name: string; first: string; last: string; lastNum: number | null }[] = [];
  for (const { issue, series } of list) {
    const name = seriesTitle(series);
    const prev = runs[runs.length - 1];
    const n = issue.sort_number;
    if (prev && prev.name === name && prev.lastNum !== null && n !== null && n === prev.lastNum + 1) {
      prev.last = issue.number;
      prev.lastNum = n;
    } else {
      runs.push({ name, first: issue.number, last: issue.number, lastNum: n });
    }
  }
  return runs.map((r) => (r.first === r.last ? `${r.name} #${r.first}` : `${r.name} #${r.first}–${r.last}`)).join(", ");
}
