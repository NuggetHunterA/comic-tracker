import type { Page, Route } from "@playwright/test";

// A stand-in for Supabase: canned rows for every table the app reads.
// Writes are accepted and forgotten. The app has no sign-in.

const PROJECT = "towpmroicvnsbobktsfz";
export const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export const SERIES = [
  { id: 1, name: "Absolute Batman", year_began: 2024, publisher: "DC Comics", volume: 1, status: "Ongoing" },
  { id: 2, name: "Ultimate Spider-Man", year_began: 2024, publisher: "Marvel", volume: 3, status: "Ongoing" },
  { id: 3, name: "Batman", year_began: 1940, publisher: "DC Comics", volume: 1, status: "Completed" },
  { id: 4, name: "The Vision", year_began: 2015, publisher: "Marvel", volume: 2, status: "Completed" },
];

export const ISSUES = [
  { id: 101, series_id: 1, number: "1", sort_number: 1, store_date: day(-120), cover_url: null, is_annual: false },
  { id: 102, series_id: 1, number: "2", sort_number: 2, store_date: day(-90), cover_url: null, is_annual: false },
  { id: 103, series_id: 1, number: "3", sort_number: 3, store_date: day(-60), cover_url: null, is_annual: false },
  { id: 201, series_id: 2, number: "1", sort_number: 1, store_date: day(-100), cover_url: null, is_annual: false },
];

// Older issues in the Archivkiste's envelopes.
const old = (id: number, series_id: number, n: number, date: string) => ({ id, series_id, number: String(n), sort_number: n, store_date: date, cover_url: null, is_annual: false });
export const ARCHIVE_ISSUES = [
  ...[404, 405, 406, 407].map((n) => old(1000 + n, 3, n, "1987-02-01")),
  ...[608, 609, 610, 611, 612, 613].map((n) => old(1000 + n, 3, n, "2002-12-01")),
  ...[1, 2, 3, 4, 5, 6].map((n) => old(2000 + n, 4, n, "2015-11-04")),
];

const envelope = (id: number, kind: string, issue_ids: number[], extra: Record<string, unknown>) => ({
  id, kind, season: null, series_id: 0, issue_ids, title: null, label_year: null, label_writer: null, reason: null,
  verified: false, status: "open", taken_count: 0, valid_from: null, ...extra,
});
export const ARCHIVE = [
  envelope(1, "classic", [1404, 1405, 1406, 1407], { series_id: 3, title: "Year One", label_year: 1987, label_writer: "Frank Miller", reason: "Aus der Klassiker-Liste", verified: true }),
  envelope(2, "writer", [2001, 2002, 2003, 2004, 2005, 2006], { series_id: 4, label_year: 2015, label_writer: "Tom King", reason: "Weil du Tom King zweimal eine 9 oder 10 gegeben hast" }),
  envelope(3, "classic", [1608, 1609, 1610, 1611, 1612, 1613], { series_id: 3, title: "Hush", label_year: 2002, label_writer: "Jeph Loeb", reason: "Aus der Klassiker-Liste", verified: true }),
];

export const pile = (issue_id: number) => ({ issue_id, status: "pile", format: "print", old_pile: false, bought_on: null, read_on: null, rating: null, skip_plan: false });

const TABLES: Record<string, unknown[]> = {
  settings: [{ infinite_delay_days: 30, webtoon_delay_days: 30, max_per_evening: 3, list_rules: null }],
  followed_series: [
    { series_id: 1, default_format: "print", paused: false, created_at: day(-200) },
    { series_id: 2, default_format: "print", paused: false, created_at: day(-200) },
  ],
  wishlist_series: [],
  dismissed_suggestions: [],
  user_issues: ISSUES.map((i) => pile(i.id)),
  reading_list: [],
  events: [],
  event_issues: [],
  archive_suggestions: ARCHIVE,
  series: SERIES,
  issues: [...ISSUES, ...ARCHIVE_ISSUES],
};

/** `tables` replaces the canned rows of single tables for one test. */
export async function fakeSupabase(page: Page, tables: Record<string, unknown[]> = {}) {
  const live: Record<string, unknown[]> = { ...TABLES, ...tables };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

  await page.route(`https://${PROJECT}.supabase.co/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    if (url.pathname.startsWith("/auth/v1/")) return json(route, {});
    if (url.pathname.startsWith("/functions/v1/")) return json(route, {});
    const table = url.pathname.match(/^\/rest\/v1\/(?:rpc\/)?([^/?]+)/)?.[1];
    if (!table) return json(route, {}, 404);
    // An update by issue_id sticks for the rest of the test, so a reload shows it.
    const eqId = url.searchParams.get("issue_id")?.match(/^eq\.(\d+)$/)?.[1];
    if (req.method() === "PATCH" && table === "user_issues" && eqId) {
      const body = req.postDataJSON() as Record<string, unknown>;
      live.user_issues = live.user_issues.map((r) => ((r as { issue_id: number }).issue_id === Number(eqId) ? { ...(r as object), ...body } : r));
    }
    if (req.method() !== "GET") return json(route, req.headers()["accept"]?.includes("pgrst.object") ? {} : [], 201);
    let rows = live[table] ?? [];
    // The app asks for issues and series by id: ?id=in.(1,2)
    const ids = url.searchParams.get("id")?.match(/^in\.\((.*)\)$/)?.[1];
    if (ids !== undefined) {
      const want = new Set(ids.split(",").map(Number));
      rows = rows.filter((r) => want.has((r as { id: number }).id));
    }
    // The catalog asks for issues with their series joined in.
    if (table === "issues" && url.searchParams.get("select")?.includes("series!inner")) {
      rows = ISSUES.map((i) => ({ ...i, series: SERIES.find((x) => x.id === i.series_id) }));
    }
    return json(route, rows);
  });
}
