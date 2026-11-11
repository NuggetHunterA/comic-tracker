import { describe, expect, it } from "vitest";
import { readingYears, yearStats, type YearRead } from "./yearStats";

const TODAY = "2026-11-11";
let next = 1;
const r = (readOn: string, rating: number | null = null, seriesId = 1, n = next, storeDate: string | null = null, verlag: YearRead["verlag"] = "dc"): YearRead =>
  ({ issueId: next++, seriesId, number: String(n), sortNumber: n, readOn, rating, storeDate, verlag });
const names = (id: number) => (id === 1 ? "Nightwing" : id === 2 ? "Batman" : "Detective Comics");

describe("yearStats", () => {
  it("counts only dated reads of the year up to today", () => {
    const s = yearStats([r("2026-10-30"), r("2026-11-01"), r("2025-12-31"), r("2026-11-12")], 2026, TODAY, names);
    expect(s.count).toBe(2);
    expect(s.evenings).toBe(2);
    expect(s.open).toBe(true);
    expect(s.first).toBe("2026-10-30");
  });

  it("lays out months from the first read to this month, empty ones included", () => {
    const s = yearStats([r("2026-08-03"), r("2026-10-30")], 2026, TODAY, names);
    expect(s.months.map((m) => [m.month, m.reads.length])).toEqual([[7, 1], [8, 0], [9, 1], [10, 0]]);
  });

  it("runs a past year to December", () => {
    const s = yearStats([r("2025-11-03")], 2025, TODAY, names);
    expect(s.open).toBe(false);
    expect(s.months[s.months.length - 1].month).toBe(11);
  });

  it("finds the longest run of evenings", () => {
    const s = yearStats([r("2026-10-30"), r("2026-10-31"), r("2026-11-01"), r("2026-11-03"), r("2026-11-04")], 2026, TODAY, names);
    expect(s.longestRun).toBe(3);
  });

  it("picks the top five and the best series with at least two grades", () => {
    const s = yearStats([r("2026-11-01", 10, 1), r("2026-11-02", 9, 2), r("2026-11-02", 7, 1), r("2026-11-03", 9, 3), r("2026-11-03", 3, 3), r("2026-11-04", 8, 2), r("2026-11-05", 6, 2)], 2026, TODAY, names);
    expect(s.top).toHaveLength(5);
    expect(s.bestIssue?.rating).toBe(10);
    expect(s.bestSeries?.seriesId).toBe(1);
    expect(s.bestSeries?.avg).toBe(8.5);
  });

  it("writes the fun facts from the reads", () => {
    const s = yearStats([
      r("2026-10-30", 5, 3, 1085, "2024-05-08"), r("2026-10-30", null, 3, 1086, "2024-06-12"), r("2026-10-30", null, 3, 1087, "2024-07-10"),
      r("2026-10-31", 9, 1, 113, "2024-04-02"), r("2026-11-06", null, 1, 114), r("2026-11-07", null, 1, 115),
    ], 2026, TODAY, names);
    const f = Object.fromEntries(s.facts.map((x) => [x.key, x.text]));
    expect(f.rekord).toBe("3 Hefte an einem Abend: Detective Comics #1085 bis #1087, Freitag, 30. Oktober.");
    expect(f.stueck).toBe("Nightwing #113 bis #115: 3 Hefte an 3 Abenden.");
    expect(f.zeit).toContain("Das älteste: Nightwing #113 vom April 2024.");
    expect(f.note).toBe("4 Hefte haben noch keine Note. Tipp ein Cover an der Wand an, um sie nachzutragen.");
    expect(f.stapel).toBe("Rund 130 Comicseiten. Gestapelt etwa 2 cm Papier.");
  });

  it("splits DC and Marvel", () => {
    const s = yearStats([r("2026-11-01", null, 1, 1, null, "dc"), r("2026-11-02", null, 2, 1, null, "marvel")], 2026, TODAY, names);
    expect([s.dc, s.marvel]).toEqual([1, 1]);
  });
});

describe("readingYears", () => {
  it("lists years with dated reads, newest first", () => {
    expect(readingYears(["2026-01-02", null, "2025-05-01", "2026-03-03", "2027-01-01"], TODAY)).toEqual([2026, 2025]);
  });
});
