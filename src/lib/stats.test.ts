import { describe, expect, it } from "vitest";
import { gradeLabel, readingStats, type ReadIssue } from "./stats";

// 2026-11-04 is a Wednesday; its week starts Monday 2026-11-02.
const TODAY = "2026-11-04";
let next = 1;
const read = (readOn: string | null, rating: number | null = null, seriesId = 1): ReadIssue => ({ issueId: next++, seriesId, readOn, rating });

describe("readingStats", () => {
  it("counts this week from Monday and last week apart", () => {
    const s = readingStats([read("2026-11-02"), read("2026-11-04"), read("2026-11-04"), read("2026-11-01"), read("2026-10-26"), read(null)], TODAY);
    expect(s.week.start).toBe("2026-11-02");
    expect(s.week.count).toBe(3);
    expect(s.week.days.map((d) => d.ids.length)).toEqual([1, 0, 2, 0, 0, 0, 0]);
    expect(s.lastWeek).toBe(2);
    expect(s.total).toBe(6);
  });

  it("lays out twelve weeks ending with this one", () => {
    const s = readingStats([read("2026-11-03"), read("2026-08-17"), read("2026-08-16")], TODAY);
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks[11]).toEqual({ start: "2026-11-02", count: 1 });
    expect(s.weeks[0]).toEqual({ start: "2026-08-17", count: 1 });
  });

  it("counts month and year by reading date only", () => {
    const s = readingStats([read("2026-11-01"), read("2026-10-31"), read("2025-12-31"), read(null)], TODAY);
    expect(s.month).toBe(1);
    expect(s.year).toBe(2);
  });

  it("keeps a streak alive while tonight is still open", () => {
    expect(readingStats([read("2026-11-03"), read("2026-11-02"), read("2026-10-31")], TODAY).streak).toBe(2);
    expect(readingStats([read("2026-11-04"), read("2026-11-03")], TODAY).streak).toBe(2);
    expect(readingStats([read("2026-11-02")], TODAY).streak).toBe(0);
  });

  it("ranks issues by grade, the newer read first on a tie", () => {
    const a = read("2026-10-01", 9);
    const b = read("2026-10-20", 9);
    const c = read(null, 10);
    const s = readingStats([a, b, c, read("2026-11-01", 4), read("2026-11-02")], TODAY);
    expect(s.topIssues.map((r) => r.issueId)).toEqual([c.issueId, b.issueId, a.issueId, expect.any(Number)]);
    expect(s.rated).toBe(4);
    expect(s.unrated).toBe(1);
    expect(s.avg).toBeCloseTo(8);
    expect(s.grades[8]).toBe(2);
  });

  it("ranks only series with two graded issues", () => {
    const s = readingStats([
      read("2026-10-01", 10, 7),
      read("2026-10-02", 8, 1), read("2026-10-03", 9, 1),
      read("2026-10-04", 9, 2), read("2026-10-05", 9, 2), read("2026-10-06", 6, 2),
    ], TODAY);
    expect(s.topSeries.map((x) => x.seriesId)).toEqual([1, 2]);
    expect(s.topSeries[0]).toMatchObject({ avg: 8.5, rated: 2 });
  });

  it("is empty without reads", () => {
    const s = readingStats([], TODAY);
    expect(s.week.count).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.topSeries).toEqual([]);
  });
});

describe("gradeLabel", () => {
  it("uses a comma", () => expect(gradeLabel(8.4567)).toBe("8,5"));
});
