// Loading: reads everything the app shows from Supabase in one go.
import type { ListEntry } from "./plan";
import { supabase } from "./supabase";
import type { EventIssue, EventRow, Followed, Issue, Series, SeriesRank, Settings, UserIssue } from "./types";

export interface Data {
  settings: Settings;
  followed: Followed[];
  wishlistSeries: number[];
  dismissed: number[];
  userIssues: Map<number, UserIssue>;
  issues: Map<number, Issue>;
  series: Map<number, Series>;
  events: EventRow[];
  eventIssues: EventIssue[];
  seriesOrder: SeriesRank[];
  /** The saved reading list, top to bottom. */
  readingList: ListEntry[];
  /** The rules the list was last sorted by (see rulesKey). */
  listRules: string | null;
}

const DEFAULT_SETTINGS: Settings = { infinite_delay_days: 30, webtoon_delay_days: 30, max_per_evening: 3 };

async function inChunks<T>(ids: number[], fetch: (chunk: number[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await fetch(ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

export async function load(): Promise<Data> {
  const [settings, followed, wishlist, dismissed, userIssues, list, events, eventIssues, seriesOrder] = await Promise.all([
    // All columns, so the app still loads where webtoon_delay_days is not migrated yet.
    supabase.from("settings").select("*").maybeSingle(),
    supabase.from("followed_series").select("series_id, default_format, paused, created_at"),
    supabase.from("wishlist_series").select("series_id"),
    supabase.from("dismissed_suggestions").select("series_id"),
    supabase.from("user_issues").select("issue_id, status, format, old_pile, bought_on, read_on, rating, skip_plan"),
    supabase.from("reading_list").select("issue_id, position, manual, added").order("position"),
    supabase.from("events").select("id, name, short, color, manual_order, created_at").order("created_at"),
    supabase.from("event_issues").select("event_id, issue_id, position"),
    supabase.from("series_order").select("series_id, position, whole").order("position"),
  ]);
  for (const r of [settings, followed, wishlist, dismissed, userIssues, list, events, eventIssues, seriesOrder]) if (r.error) throw r.error;

  const uis = (userIssues.data ?? []) as UserIssue[];
  const links = (eventIssues.data ?? []) as EventIssue[];
  const issueIds = [...new Set([...uis.map((u) => u.issue_id), ...links.map((l) => l.issue_id)])];
  const issues = await inChunks<Issue>(issueIds, (c) =>
    supabase.from("issues").select("id, series_id, number, sort_number, store_date, cover_url, is_annual").in("id", c),
  );
  const seriesIds = [
    ...new Set([
      ...issues.map((i) => i.series_id),
      ...(followed.data ?? []).map((f) => f.series_id),
      ...(wishlist.data ?? []).map((w) => w.series_id),
    ]),
  ];
  const series = await inChunks<Series>(seriesIds, (c) =>
    supabase.from("series").select("id, name, year_began, publisher, volume, status").in("id", c),
  );
  if (!settings.data) await supabase.from("settings").insert({});

  const s = settings.data as (Settings & { list_rules: string | null }) | null;
  return {
    settings: s ? { infinite_delay_days: s.infinite_delay_days, webtoon_delay_days: s.webtoon_delay_days ?? s.infinite_delay_days, max_per_evening: s.max_per_evening } : DEFAULT_SETTINGS,
    followed: (followed.data ?? []) as Followed[],
    wishlistSeries: (wishlist.data ?? []).map((w) => w.series_id),
    dismissed: (dismissed.data ?? []).map((d) => d.series_id),
    userIssues: new Map(uis.map((u) => [u.issue_id, u])),
    issues: new Map(issues.map((i) => [i.id, i])),
    series: new Map(series.map((s) => [s.id, s])),
    events: (events.data ?? []) as EventRow[],
    eventIssues: links,
    seriesOrder: (seriesOrder.data ?? []) as SeriesRank[],
    readingList: ((list.data ?? []) as { issue_id: number; manual: boolean; added: boolean }[]).map((r) => ({ issueId: r.issue_id, manual: r.manual, added: r.added })),
    listRules: s?.list_rules ?? null,
  };
}

