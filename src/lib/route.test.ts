import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute, type Route } from "./route";

const routes: [string, Route][] = [
  ["#plan", { tab: "plan", sel: null }],
  ["#plan/heft/12", { tab: "plan", sel: 12 }],
  ["#stapel", { tab: "stapel", sel: null }],
  ["#stapel/serie/4", { tab: "stapel", sel: { kind: "series", id: 4 } }],
  ["#stapel/serie/4/alle", { tab: "stapel", sel: { kind: "all", id: 4 } }],
  ["#stapel/serie/4/alle/12", { tab: "stapel", sel: { kind: "all", id: 4, sel: 12 } }],
  ["#stapel/heft/12", { tab: "stapel", sel: { kind: "issue", id: 12 } }],
  ["#stapel/heft/12/serie/4", { tab: "stapel", sel: { kind: "issue", id: 12, series: 4 } }],
  ["#stapel/heft/12/alle/4", { tab: "stapel", sel: { kind: "issue", id: 12, series: 4, fromAll: true } }],
  ["#stapel/eintragen", { tab: "stapel", sel: { kind: "import" } }],
  ["#stapel/serien-ordnen", { tab: "stapel", sel: { kind: "order" } }],
  ["#stapel/reihenfolge", { tab: "stapel", sel: { kind: "list" } }],
  ["#stapel/jahr/2026", { tab: "stapel", sel: { kind: "year", year: 2026 } }],
  ["#stapel/jahr/2026/heft/12", { tab: "stapel", sel: { kind: "year", year: 2026, issue: 12 } }],
  ["#katalog", { tab: "katalog", sel: null }],
  ["#katalog/heft/12", { tab: "katalog", sel: 12 }],
  ["#serien", { tab: "serien", sub: "serien", sel: null }],
  ["#serien/wunsch", { tab: "serien", sub: "wunsch", sel: null }],
  ["#serien/events", { tab: "serien", sub: "events", sel: null }],
  ["#serien/events/7", { tab: "serien", sub: "events", sel: { kind: "event", id: 7 } }],
  ["#serien/serie/4", { tab: "serien", sub: "serien", sel: { kind: "series", id: 4 } }],
  ["#serien/serie/4/alle/12", { tab: "serien", sub: "serien", sel: { kind: "all", id: 4, sel: 12 } }],
  ["#serien/wunsch/heft/12", { tab: "serien", sub: "wunsch", sel: { kind: "issue", id: 12 } }],
  ["#serien/heft/12/serie/4", { tab: "serien", sub: "serien", sel: { kind: "issue", id: 12, back: { kind: "series", id: 4 } } }],
  ["#serien/heft/12/alle/4/12", { tab: "serien", sub: "serien", sel: { kind: "issue", id: 12, back: { kind: "all", id: 4, sel: 12 } } }],
];

describe("route", () => {
  it.each(routes)("reads and writes %s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(formatRoute(route)).toBe(hash);
  });

  it("falls back to the plan for anything it does not know", () => {
    expect(parseRoute("")).toEqual({ tab: "plan", sel: null });
    expect(parseRoute("#quatsch/heft/1")).toEqual({ tab: "plan", sel: null });
    expect(parseRoute("#plan/heft/abc")).toEqual({ tab: "plan", sel: null });
    expect(parseRoute("#stapel/serie/x")).toEqual({ tab: "stapel", sel: null });
  });

  it("keeps a series found in the search for the session", () => {
    const found = { id: 99, name: "Absolute Batman", year_began: 2024, publisher: "DC Comics", volume: 1, issue_count: 10 };
    const hash = formatRoute({ tab: "serien", sub: "serien", sel: { kind: "series", id: 99, found } as never });
    expect(hash).toBe("#serien/serie/99");
    expect(parseRoute(hash)).toEqual({ tab: "serien", sub: "serien", sel: { kind: "series", id: 99, found } });
  });
});
