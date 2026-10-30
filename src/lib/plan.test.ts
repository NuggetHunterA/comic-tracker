import { describe, expect, it } from "vitest";
import { buildPlan, readableFrom, readingQueue, stalledSeries, type PlanIssue } from "./plan";

const TODAY = "2026-10-29";

function issue(id: number, seriesId: number, n: number, extra: Partial<PlanIssue> = {}): PlanIssue {
  return {
    id,
    seriesId,
    sortNumber: n,
    storeDate: "2024-01-01",
    oldPile: false,
    readableFrom: "2024-01-01",
    event: null,
    ...extra,
  };
}

const nums = (list: PlanIssue[]) => list.map((i) => `${i.seriesId}#${i.sortNumber}`);

describe("readableFrom", () => {
  it("adds the Infinite delay to the store date", () => {
    expect(readableFrom("2026-11-26", "infinite", null, 30)).toBe("2026-12-26");
  });
  it("needs a purchase for print", () => {
    expect(readableFrom("2026-11-26", "print", null, 30)).toBeNull();
    expect(readableFrom("2026-11-26", "print", "2026-11-28", 30)).toBe("2026-11-28");
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

  it("uses blocks per series when there are no events", () => {
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
    const arc = (pos: number) => ({ event: { id: 7, position: pos } });
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
      issue(1, 10, 1, { event: { id: 9, position: 1 } }),
      issue(2, 20, 50, { event: { id: 9, position: 2 }, storeDate: "2024-03-01" }),
      issue(3, 10, 2, { event: { id: 9, position: 3 } }),
      issue(4, 20, 49, { storeDate: "2024-02-01" }),
    ]);
    expect(nums(q)).toEqual(["10#1", "20#50", "10#2", "20#49"]);
  });

  it("lets ranked series take their turn first, the rest by date", () => {
    const issues = [1, 2].flatMap((n) => [
      issue(n, 10, n),
      issue(100 + n, 20, n, { storeDate: "2024-02-01" }),
      issue(200 + n, 30, n, { storeDate: "2024-03-01" }),
    ]);
    const q = readingQueue(issues, 1, { ranked: [30], whole: new Set() });
    expect(nums(q)).toEqual(["30#1", "10#1", "20#1", "30#2", "10#2", "20#2"]);
  });

  it("reads series above the line to the end before the others take turns", () => {
    const issues = [1, 2, 3].flatMap((n) => [issue(n, 10, n), issue(100 + n, 20, n, { storeDate: "2024-02-01" })]);
    const q = readingQueue(issues, 2, { ranked: [20, 10], whole: new Set([20]) });
    expect(nums(q)).toEqual(["20#1", "20#2", "20#3", "10#1", "10#2", "10#3"]);
  });

  it("reads an event in one go where a whole series reaches it, then goes on with the series", () => {
    const q = readingQueue([
      issue(1, 10, 1),
      issue(2, 10, 2, { event: { id: 9, position: 2 } }),
      issue(3, 10, 3),
      issue(11, 20, 7, { event: { id: 9, position: 1 } }),
      issue(12, 20, 8),
    ], 4, { ranked: [10], whole: new Set([10]) });
    expect(nums(q)).toEqual(["10#1", "20#7", "10#2", "10#3", "20#8"]);
  });

  it("keeps the old pile first even for a whole series", () => {
    const q = readingQueue([
      issue(1, 10, 1, { oldPile: true }),
      issue(2, 20, 1),
      issue(3, 20, 2),
    ], 4, { ranked: [20], whole: new Set([20]) });
    expect(nums(q)).toEqual(["10#1", "20#1", "20#2"]);
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

  it("keeps pins, drops past pins and counts pins toward the maximum", () => {
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
    // The past pin on #4 is gone; #2 to #4 wait for the pinned #1 tomorrow.
    expect(plan[0]).toEqual({ date: TODAY, entries: [] });
    expect(plan[1].entries).toEqual([
      { issueId: 1, pinned: true },
      { issueId: 2, pinned: false },
      { issueId: 3, pinned: false },
    ]);
    expect(plan[2].entries).toEqual([{ issueId: 4, pinned: false }]);
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

  describe("pinned event issues", () => {
    const arc = (pos: number) => ({ event: { id: 7, position: pos } });
    const days = (plan: ReturnType<typeof buildPlan>) => plan.map((e) => [e.date, e.entries.map((x) => x.issueId)]);

    it("starts the event at its first open part and pulls the rest along", () => {
      const issues = [
        issue(1, 20, 1, { storeDate: "2023-01-01" }),
        issue(2, 20, 2, { storeDate: "2023-01-01" }),
        issue(11, 10, 1, arc(1)),
        issue(12, 10, 2, arc(2)),
        issue(13, 10, 3, arc(3)),
      ];
      const plan = buildPlan({ issues, pins: [{ issueId: 12, evening: TODAY, slot: 1 }], today: TODAY, maxPerEvening: 3 });
      expect(days(plan)).toEqual([
        ["2026-10-29", [11, 12, 13]],
        ["2026-10-30", [1, 2]],
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
        ["2026-10-29", []],
        ["2026-10-31", [11, 12, 13]],
      ]);
    });

    it("waits for an unreadable part and keeps event order", () => {
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

  describe("started events", () => {
    const ev = (pos: number) => ({ event: { id: 7, position: pos } });
    const days = (plan: ReturnType<typeof buildPlan>) => plan.map((e) => [e.date, e.entries.map((x) => x.issueId)]);
    const oldPile = [1, 2, 3, 4, 5, 6].map((n) => issue(n, 30, n, { oldPile: true, storeDate: "2020-01-01" }));

    it("keep the rest of the event at the front, before the old pile", () => {
      // Parts 1 to 3 were read yesterday; 4 to 6 come from three series.
      const issues = [...oldPile, issue(14, 10, 4, ev(4)), issue(15, 20, 9, ev(5)), issue(16, 10, 5, ev(6))];
      const plan = buildPlan({ issues, pins: [], today: TODAY, maxPerEvening: 3, startedEvents: [7] });
      expect(days(plan).slice(0, 2)).toEqual([
        ["2026-10-29", [14, 15, 16]],
        ["2026-10-30", [1, 2, 3]],
      ]);
    });

    it("pause at a part that is not readable yet and pick up first thing when it is", () => {
      const issues = [
        ...oldPile,
        issue(14, 10, 4, ev(4)),
        issue(15, 20, 9, { ...ev(5), readableFrom: "2026-10-31" }),
        issue(16, 10, 5, ev(6)),
        issue(21, 20, 10),
      ];
      const plan = buildPlan({ issues, pins: [], today: TODAY, maxPerEvening: 3, startedEvents: [7] });
      expect(days(plan).slice(0, 3)).toEqual([
        ["2026-10-29", [14, 1, 2]],
        ["2026-10-30", [3, 4, 5]],
        ["2026-10-31", [15, 16, 6]],
      ]);
      // Series 20 goes on after its waiting event issue, never before it.
      expect(plan.findIndex((e) => e.entries.some((x) => x.issueId === 21))).toBeGreaterThan(2);
    });

    it("read an event issue before earlier open issues of its series", () => {
      const issues = [issue(28, 10, 128), issue(29, 10, 129), issue(33, 10, 133, ev(3)), issue(41, 20, 1, ev(4))];
      const plan = buildPlan({ issues, pins: [], today: TODAY, maxPerEvening: 3, startedEvents: [7] });
      expect(days(plan)).toEqual([
        ["2026-10-29", [33, 41, 28]],
        ["2026-10-30", [29]],
      ]);
    });
  });

  it("does not read later issues of a series before a pinned earlier one", () => {
    const issues = [
      issue(13, 10, 113),
      issue(14, 10, 114),
      issue(15, 10, 115),
      issue(16, 10, 116),
      issue(21, 20, 1, { storeDate: "2025-01-01" }),
    ];
    const plan = buildPlan({ issues, pins: [{ issueId: 13, evening: "2026-10-30", slot: 1 }], today: TODAY, maxPerEvening: 3 });
    expect(plan.map((e) => [e.date, e.entries.map((x) => x.issueId)])).toEqual([
      ["2026-10-29", [21]],
      ["2026-10-30", [13, 14, 15]],
      ["2026-10-31", [16]],
    ]);
  });
});

describe("stalledSeries", () => {
  it("names the first issue without a date that holds back later ones", () => {
    const stalled = stalledSeries([
      issue(1, 10, 1),
      issue(2, 10, 2, { readableFrom: null }),
      issue(3, 10, 3),
      issue(4, 10, 4, { readableFrom: null }),
      issue(11, 20, 1),
      issue(12, 20, 2, { readableFrom: null }),
    ]);
    expect(stalled.map((s) => [s.issue.id, s.behind])).toEqual([[2, 2]]);
  });
});
