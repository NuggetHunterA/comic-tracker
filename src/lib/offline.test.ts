import { describe, expect, it } from "vitest";
import { applyOp, enqueue, flushQueue, isNetworkError, stampLabel, type QueuedOp } from "./offline";
import { syncStatus } from "./syncStatus";
import type { UserIssue } from "./types";

const ui: UserIssue = { issue_id: 1, status: "pile", format: "print", old_pile: true, bought_on: null, read_on: null, rating: null, skip_plan: false };

describe("offline queue", () => {
  it("keeps one op per issue and kind, the latest", () => {
    let q: QueuedOp[] = [];
    q = enqueue(q, { kind: "read", issueId: 1, day: "2026-11-11" });
    q = enqueue(q, { kind: "rate", issueId: 1, rating: 7 });
    q = enqueue(q, { kind: "rate", issueId: 1, rating: 9 });
    expect(q).toEqual([{ kind: "read", issueId: 1, day: "2026-11-11" }, { kind: "rate", issueId: 1, rating: 9 }]);
  });

  it("applies read and rating to the local copy", () => {
    const read = applyOp(ui, { kind: "read", issueId: 1, day: "2026-11-11" });
    expect(read).toMatchObject({ status: "read", read_on: "2026-11-11" });
    expect(applyOp(read, { kind: "rate", issueId: 1, rating: 8 })?.rating).toBe(8);
    expect(applyOp(undefined, { kind: "rate", issueId: 1, rating: 8 })).toBeUndefined();
  });

  it("stops at the first failed write and keeps the rest in order", async () => {
    const q: QueuedOp[] = [
      { kind: "read", issueId: 1, day: "d" },
      { kind: "read", issueId: 2, day: "d" },
      { kind: "read", issueId: 3, day: "d" },
    ];
    const written: number[] = [];
    const r = await flushQueue(q, async (op) => {
      if (op.issueId === 2) throw new TypeError("Failed to fetch");
      written.push(op.issueId);
    });
    expect(written).toEqual([1]);
    expect(r.done).toBe(1);
    expect(r.left.map((o) => o.issueId)).toEqual([2, 3]);
    expect(isNetworkError(r.error)).toBe(true);
  });

  it("tells a missing network from a refused write", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "TypeError: Load failed" })).toBe(true);
    expect(isNetworkError({ message: "new row violates row-level security policy" })).toBe(false);
  });
});

describe("stampLabel", () => {
  const now = new Date(2026, 10, 11, 20, 0);
  it("names today, yesterday, else the day", () => {
    expect(stampLabel(new Date(2026, 10, 11, 9, 7).toISOString(), now)).toBe("HEUTE 09:07");
    expect(stampLabel(new Date(2026, 10, 10, 21, 7).toISOString(), now)).toBe("GESTERN 21:07");
    expect(stampLabel(new Date(2026, 10, 9, 21, 7).toISOString(), now)).toBe("MO 9.11. 21:07");
  });
});

describe("syncStatus", () => {
  const now = new Date("2026-11-11T10:00:00Z").getTime();
  const run = (finished: string, ok: boolean) => ({ started_at: finished, finished_at: finished, ok });
  it("is fine after a recent good run", () => {
    expect(syncStatus([run("2026-11-11T09:07:00Z", true)], now)).toEqual({ lastOk: "2026-11-11T09:07:00Z", stuck: false });
  });
  it("is stuck when the newest run failed", () => {
    expect(syncStatus([run("2026-11-11T09:07:00Z", false), run("2026-11-11T08:07:00Z", true)], now)).toEqual({ lastOk: "2026-11-11T08:07:00Z", stuck: true });
  });
  it("is stuck when the last good run is over three hours old", () => {
    expect(syncStatus([run("2026-11-11T06:07:00Z", true)], now)?.stuck).toBe(true);
  });
  it("knows nothing without finished runs", () => {
    expect(syncStatus([], now)).toBeNull();
  });
});
