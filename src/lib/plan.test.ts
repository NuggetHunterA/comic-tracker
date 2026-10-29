import { describe, expect, it } from "vitest";
import { buildPlan, readableFrom, readingQueue, type PlanIssue } from "./plan";

const TODAY = "2026-10-29";

function issue(id: number, seriesId: number, n: number, extra: Partial<PlanIssue> = {}): PlanIssue {
  return {
    id,
    seriesId,
    sortNumber: n,
    storeDate: "2024-01-01",
    oldPile: false,
    readableFrom: "2024-01-01",
    arcs: [],
    ...extra,
  };
}

const nums = (list: PlanIssue[]) => list.map((i) => `${i.seriesId}#${i.sortNumber}`);

describe("readableFrom", () => {
  it("adds the Infinite delay to the store date", () => {
    expect(readableFrom("2026-11-26", "infinite", null, 30)).toBe("2026-12-26");
  });
  it("needs a purchase for print and digital", () => {
    expect(readableFrom("2026-11-26", "print", null, 30)).toBeNull();
    expect(readableFrom("2026-11-26", "digital", "2026-11-28", 30)).toBe("2026-11-28");
  });
  it("has no date without a store date or format", () => {
    expect(readableFrom(null, "infinite", null, 30)).toBeNull();
    expect(readableFrom("2026-11-26", null, null, 30)).toBeNull();
  });
});

describe("readingQueue", () => {
  it("reads old pile first and keeps number order", () => {
    const q = readingQueue([
      issue(1, 10, 2),
      issue(2, 20, 5, { oldPile: true }),
      issue(3, 10, 1),
      issue(4, 20, 4, { oldPile: true }),
    ]);
    expect(nums(q)).toEqual(["20#4", "20#5", "10#1", "10#2"]);
  });

  it("uses blocks per series when there are no arcs", () => {
    const issues = [1, 2, 3, 4, 5, 6].flatMap((n) => [issue(n, 10, n), issue(100 + n, 20, n, { storeDate: "2024-02-01" })]);
    const q = readingQueue(issues, 4);
    expect(nums(q)).toEqual([
      "10#1", "10#2", "10#3", "10#4",
      "20#1", "20#2", "20#3", "20#4",
      "10#5", "10#6",
      "20#5", "20#6",
    ]);
  });

  it("reads an arc in one go, then switches series", () => {
    const arc = (pos: number) => ({ arcs: [{ arcId: 7, position: pos }] });
    const q = readingQueue([
      issue(1, 10, 1, arc(1)),
      issue(2, 10, 2, arc(2)),
      issue(3, 10, 3, arc(3)),
      issue(4, 10, 4, arc(4)),
      issue(5, 10, 5, arc(5)),
      issue(6, 10, 6),
      issue(11, 20, 1, { storeDate: "2024-02-01" }),
    ]);
    expect(nums(q)).toEqual(["10#1", "10#2", "10#3", "10#4", "10#5", "20#1", "10#6"]);
  });

  it("follows crossover order across series", () => {
    const q = readingQueue([
      issue(1, 10, 1, { arcs: [{ arcId: 9, position: 1 }] }),
      issue(2, 20, 50, { arcs: [{ arcId: 9, position: 2 }], storeDate: "2024-03-01" }),
      issue(3, 10, 2, { arcs: [{ arcId: 9, position: 3 }] }),
      issue(4, 20, 49, { storeDate: "2024-02-01" }),
    ]);
    expect(nums(q)).toEqual(["10#1", "20#50", "10#2", "20#49"]);
  });
});

describe("buildPlan", () => {
  it("fills evenings up to the maximum and rolls on", () => {
    const issues = [1, 2, 3, 4, 5].map((n) => issue(n, 10, n));
    const plan = buildPlan({ issues, pins: [], today: TODAY, maxPerEvening: 3 });
    expect(plan.map((e) => [e.date, e.entries.map((x) => x.issueId)])).toEqual([
      ["2026-10-29", [1, 2, 3]],
      ["2026-10-30", [4, 5]],
    ]);
  });

  it("keeps pins, moves past pins to today and counts them toward the maximum", () => {
    const issues = [1, 2, 3, 4].map((n) => issue(n, 10, n));
    const plan = buildPlan({
      issues,
      pins: [
        { issueId: 4, evening: "2026-10-20", slot: 1 },
        { issueId: 1, evening: "2026-10-30", slot: 1 },
      ],
      today: TODAY,
      maxPerEvening: 3,
    });
    expect(plan[0]).toEqual({
      date: TODAY,
      entries: [
        { issueId: 4, pinned: true },
        { issueId: 2, pinned: false },
        { issueId: 3, pinned: false },
      ],
    });
    expect(plan[1].entries).toEqual([{ issueId: 1, pinned: true }]);
  });

  it("waits for Infinite dates without skipping ahead in a series", () => {
    const issues = [
      issue(1, 10, 1, { readableFrom: "2026-10-31" }),
      issue(2, 10, 2, { readableFrom: TODAY }),
      issue(3, 20, 1, { readableFrom: TODAY, storeDate: "2025-01-01" }),
    ];
    const plan = buildPlan({ issues, pins: [], today: TODAY, maxPerEvening: 3 });
    expect(plan.map((e) => [e.date, e.entries.map((x) => x.issueId)])).toEqual([
      ["2026-10-29", [3]],
      ["2026-10-31", [1, 2]],
    ]);
  });

  it("never plans issues that are not readable", () => {
    const plan = buildPlan({ issues: [issue(1, 10, 1, { readableFrom: null })], pins: [], today: TODAY, maxPerEvening: 3 });
    expect(plan).toEqual([{ date: TODAY, entries: [] }]);
  });

  describe("pinned arc issues", () => {
    const arc = (pos: number) => ({ arcs: [{ arcId: 7, position: pos }] });
    const days = (plan: ReturnType<typeof buildPlan>) => plan.map((e) => [e.date, e.entries.map((x) => x.issueId)]);

    it("pulls the later parts of the arc onto the pinned evening", () => {
      const issues = [
        issue(1, 20, 1, { storeDate: "2023-01-01" }),
        issue(2, 20, 2, { storeDate: "2023-01-01" }),
        issue(11, 10, 1, arc(1)),
        issue(12, 10, 2, arc(2)),
        issue(13, 10, 3, arc(3)),
      ];
      const plan = buildPlan({ issues, pins: [{ issueId: 12, evening: TODAY, slot: 1 }], today: TODAY, maxPerEvening: 3 });
      expect(days(plan)).toEqual([
        ["2026-10-29", [12, 13, 1]],
        ["2026-10-30", [2, 11]],
      ]);
    });

    it("puts parts that do not fit first on the next evenings", () => {
      const issues = [
        issue(1, 20, 1, { storeDate: "2023-01-01" }),
        ...[1, 2, 3, 4, 5].map((n) => issue(10 + n, 10, n, arc(n))),
      ];
      const plan = buildPlan({ issues, pins: [{ issueId: 11, evening: TODAY, slot: 1 }], today: TODAY, maxPerEvening: 2 });
      expect(days(plan)).toEqual([
        ["2026-10-29", [11, 12]],
        ["2026-10-30", [13, 14]],
        ["2026-10-31", [15, 1]],
      ]);
    });

    it("does not read later parts before a pin on a later evening", () => {
      const issues = [1, 2, 3].map((n) => issue(10 + n, 10, n, arc(n)));
      const plan = buildPlan({ issues, pins: [{ issueId: 12, evening: "2026-10-31", slot: 1 }], today: TODAY, maxPerEvening: 3 });
      expect(days(plan)).toEqual([
        ["2026-10-29", [11]],
        ["2026-10-31", [12, 13]],
      ]);
    });

    it("waits for an unreadable part and keeps arc order", () => {
      const issues = [
        issue(11, 10, 1, arc(1)),
        issue(12, 10, 2, { ...arc(2), readableFrom: "2026-10-30" }),
        issue(13, 10, 3, arc(3)),
      ];
      const plan = buildPlan({ issues, pins: [{ issueId: 11, evening: TODAY, slot: 1 }], today: TODAY, maxPerEvening: 3 });
      expect(days(plan)).toEqual([
        ["2026-10-29", [11]],
        ["2026-10-30", [12, 13]],
      ]);
    });
  });
});
