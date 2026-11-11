import type { Page, Route } from "@playwright/test";

// A stand-in for Supabase: canned rows for every table the app reads.
// Writes are accepted and forgotten. The app has no sign-in.

const PROJECT = "towpmroicvnsbobktsfz";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export const SERIES = [
  { id: 1, name: "Absolute Batman", year_began: 2024, publisher: "DC Comics", volume: 1, status: "Ongoing" },
  { id: 2, name: "Ultimate Spider-Man", year_began: 2024, publisher: "Marvel", volume: 3, status: "Ongoing" },
];

export const ISSUES = [
  { id: 101, series_id: 1, number: "1", sort_number: 1, store_date: day(-120), cover_url: null, is_annual: false },
  { id: 102, series_id: 1, number: "2", sort_number: 2, store_date: day(-90), cover_url: null, is_annual: false },
  { id: 103, series_id: 1, number: "3", sort_number: 3, store_date: day(-60), cover_url: null, is_annual: false },
  { id: 201, series_id: 2, number: "1", sort_number: 1, store_date: day(-100), cover_url: null, is_annual: false },
];

const pile = (issue_id: number) => ({ issue_id, status: "pile", format: "print", old_pile: false, bought_on: null, read_on: null, rating: null, skip_plan: false });

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
  series_order: [],
  series: SERIES,
  issues: ISSUES,
};

export async function fakeSupabase(page: Page) {
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
    if (req.method() !== "GET") return json(route, req.headers()["accept"]?.includes("pgrst.object") ? {} : [], 201);
    let rows = TABLES[table] ?? [];
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
