import { describe, expect, it } from "vitest";
import { moveInList, planEvenings, releaseInList, readableFrom, readingQueue, sortList, stalledSeries, syncList, type Evening, type ListEntry, type PlanIssue } from "./plan";

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

type Rules = Parameters<typeof sortList>[1];
const plan = (issues: PlanIssue[], rules: Rules = {}, readToday = 0) =>
  planEvenings({ list: sortList(issues, rules), issues, today: TODAY, maxPerEvening: 3, readToday });
const days = (evenings: Evening[]) => evenings.map((e) => [e.date, e.entries.map((x) => x.issueId)]);
const ids = (list: ListEntry[]) => list.map((e) => e.issueId);

describe("planEvenings", () => {
  it("fills evenings up to the maximum and rolls on", () => {
    const issues = [1, 2, 3, 4, 5].map((n) => issue(n, 10, n));
    expect(days(plan(issues))).toEqual([
      ["2026-10-29", [1, 2, 3]],
      ["2026-10-30", [4, 5]],
    ]);
  });

  it("counts issues read today toward tonight, so nothing moves up", () => {
    const issues = [2, 3, 4, 5].map((n) => issue(n, 10, n));
    expect(days(plan(issues, {}, 1))).toEqual([
      ["2026-10-29", [2, 3]],
      ["2026-10-30", [4, 5]],
    ]);
    expect(days(plan(issues, {}, 3))[0]).toEqual(["2026-10-29", []]);
  });

  it("waits for Infinite dates without skipping ahead in a series", () => {
    const issues = [
      issue(1, 10, 1, { readableFrom: "2026-10-31" }),
      issue(2, 10, 2, { readableFrom: TODAY }),
      issue(3, 20, 1, { readableFrom: TODAY, storeDate: "2025-01-01" }),
    ];
    expect(days(plan(issues))).toEqual([
      ["2026-10-29", [3]],
      ["2026-10-31", [1, 2]],
    ]);
  });

  it("never plans issues that are not readable", () => {
    expect(plan([issue(1, 10, 1, { readableFrom: null })])).toEqual([{ date: TODAY, entries: [] }]);
  });

  it("marks entries moved by hand", () => {
    const issues = [1, 2, 3].map((n) => issue(n, 10, n));
    const list = moveInList(sortList(issues), 3, 0);
    expect(planEvenings({ list, issues, today: TODAY, maxPerEvening: 3 })[0].entries).toEqual([
      { issueId: 3, pinned: true },
      { issueId: 1, pinned: false },
      { issueId: 2, pinned: false },
    ]);
  });

  describe("started events", () => {
    const ev = (pos: number) => ({ event: { id: 7, position: pos } });
    const oldPile = [1, 2, 3, 4, 5, 6].map((n) => issue(n, 30, n, { oldPile: true, storeDate: "2020-01-01" }));

    it("keep the rest of the event at the front, before the old pile", () => {
      // Parts 1 to 3 were read yesterday; 4 to 6 come from three series.
      const issues = [...oldPile, issue(14, 10, 4, ev(4)), issue(15, 20, 9, ev(5)), issue(16, 10, 5, ev(6))];
      expect(days(plan(issues, { startedEvents: [7] })).slice(0, 2)).toEqual([
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
      const p = plan(issues, { startedEvents: [7] });
      expect(days(p).slice(0, 3)).toEqual([
        ["2026-10-29", [14, 1, 2]],
        ["2026-10-30", [3, 4, 5]],
        ["2026-10-31", [15, 16, 6]],
      ]);
      // Series 20 goes on after its waiting event issue, never before it.
      expect(p.findIndex((e) => e.entries.some((x) => x.issueId === 21))).toBeGreaterThan(2);
    });

    it("read an event issue before earlier open issues of its series", () => {
      const issues = [issue(28, 10, 128), issue(29, 10, 129), issue(33, 10, 133, ev(3)), issue(41, 20, 1, ev(4))];
      expect(days(plan(issues, { startedEvents: [7] }))).toEqual([
        ["2026-10-29", [33, 41, 28]],
        ["2026-10-30", [29]],
      ]);
    });
  });
});

describe("syncList", () => {
  // Batman #153 to #160 and Nightwing #125 to #127, Nightwing older by date.
  const batman = [153, 154, 155, 156, 157, 158, 159, 160].map((n, k) => issue(n, 1, n, { oldPile: true, storeDate: `2025-0${(k % 9) + 1}-05` }));
  const nightwing = [125, 126, 127].map((n) => issue(n, 2, n, { oldPile: true, storeDate: "2025-01-20" }));

  it("does not reshuffle when an issue is read", () => {
    const issues = [...batman, ...nightwing];
    const list = sortList(issues);
    expect(ids(list).slice(0, 3)).toEqual([153, 154, 155]);
    // Batman #153 read: the rest of the list stays as it was.
    const after = syncList(list, issues.filter((i) => i.id !== 153));
    expect(ids(after)).toEqual(ids(list).slice(1));
    expect(days(planEvenings({ list: after, issues, today: TODAY, maxPerEvening: 3, readToday: 1 }))[0]).toEqual(["2026-10-29", [154, 155]]);
  });

  it("sorts an empty list from scratch", () => {
    const issues = [...batman, ...nightwing];
    expect(syncList([], issues)).toEqual(sortList(issues));
  });

  it("slots a new issue in after its series without moving the rest", () => {
    const issues = [issue(1, 10, 1), issue(2, 10, 2), issue(3, 20, 1), issue(4, 20, 2)];
    const list = [1, 3, 2, 4].map((issueId) => ({ issueId, manual: false, added: false }));
    const fresh = [...issues, issue(5, 10, 3)];
    expect(syncList(list, fresh)).toEqual([
      { issueId: 1, manual: false, added: false },
      { issueId: 3, manual: false, added: false },
      { issueId: 2, manual: false, added: false },
      { issueId: 5, manual: false, added: true },
      { issueId: 4, manual: false, added: false },
    ]);
  });

  it("slots an earlier number in before the later ones of its series", () => {
    const issues = [issue(2, 10, 2), issue(3, 10, 3), issue(9, 20, 1)];
    const list = [9, 2, 3].map((issueId) => ({ issueId, manual: false, added: false }));
    expect(ids(syncList(list, [...issues, issue(1, 10, 1)]))).toEqual([9, 1, 2, 3]);
  });

  it("slots a new event issue in next to its event", () => {
    const ev = (pos: number) => ({ event: { id: 7, position: pos } });
    const issues = [issue(1, 10, 1, ev(1)), issue(2, 20, 1, ev(3)), issue(3, 30, 1)];
    const list = [1, 2, 3].map((issueId) => ({ issueId, manual: false, added: false }));
    expect(ids(syncList(list, [...issues, issue(4, 40, 1, ev(2))]))).toEqual([1, 4, 2, 3]);
  });

  it("puts a new series at the end, or after the old pile when it is old pile", () => {
    const issues = [issue(1, 10, 1, { oldPile: true }), issue(2, 20, 1)];
    const list = [1, 2].map((issueId) => ({ issueId, manual: false, added: false }));
    expect(ids(syncList(list, [...issues, issue(3, 30, 1)]))).toEqual([1, 2, 3]);
    expect(ids(syncList(list, [...issues, issue(3, 30, 1, { oldPile: true })]))).toEqual([1, 3, 2]);
  });
});

describe("releaseInList", () => {
  it("puts an issue moved by hand back where the rules slot it, nothing else moves", () => {
    const issues = [issue(1, 10, 1), issue(2, 10, 2), issue(3, 20, 1), issue(4, 20, 2)];
    const list = moveInList([1, 3, 2, 4].map((issueId) => ({ issueId, manual: false, added: false })), 2, 0);
    expect(ids(list)).toEqual([2, 1, 3, 4]);
    const back = releaseInList(list, 2, issues);
    expect(ids(back)).toEqual([1, 2, 3, 4]);
    expect(back.every((e) => !e.manual && !e.added)).toBe(true);
  });
});

describe("sortList", () => {
  it("keeps entries moved by hand where they are", () => {
    const issues = [1, 2, 3, 4].map((n) => issue(n, 10, n));
    const moved = moveInList(sortList(issues), 4, 1);
    expect(ids(moved)).toEqual([1, 4, 2, 3]);
    expect(ids(sortList(issues, {}, moved))).toEqual([1, 4, 2, 3]);
    expect(sortList(issues, {}, moved).every((e) => !e.added)).toBe(true);
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
