import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildPlan, readableFrom, type Evening, type PlanIssue } from "./plan";
import { supabase } from "./supabase";
import { todayIso } from "./dates";
import type { ArcLink, Followed, Format, Issue, PlanPin, Series, Settings, UserIssue } from "./types";

export interface Item {
  issue: Issue;
  series: Series | undefined;
  ui: UserIssue;
  readableFrom: string | null;
  readable: boolean;
}

export interface Data {
  settings: Settings;
  followed: Followed[];
  wishlistSeries: number[];
  dismissed: number[];
  userIssues: Map<number, UserIssue>;
  issues: Map<number, Issue>;
  series: Map<number, Series>;
  arcs: ArcLink[];
  arcNames: Map<number, string>;
  pins: PlanPin[];
}

interface Store {
  data: Data | null;
  error: string | null;
  today: string;
  items: Item[];
  plan: Evening[];
  reload: () => Promise<void>;
  /** Merges catalog rows into the local cache, e.g. after a catalog query. */
  remember: (issues: Issue[], series: Series[]) => void;
}

const DEFAULT_SETTINGS: Settings = { infinite_delay_days: 30, max_per_evening: 3 };

async function inChunks<T>(ids: number[], fetch: (chunk: number[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await fetch(ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

async function load(): Promise<Data> {
  const [settings, followed, wishlist, dismissed, userIssues, pins] = await Promise.all([
    supabase.from("settings").select("infinite_delay_days, max_per_evening").maybeSingle(),
    supabase.from("followed_series").select("series_id, default_format, paused, created_at"),
    supabase.from("wishlist_series").select("series_id"),
    supabase.from("dismissed_suggestions").select("series_id"),
    supabase.from("user_issues").select("issue_id, status, format, old_pile, bought_on, read_on, rating, skip_plan"),
    supabase.from("plan_entries").select("issue_id, evening, slot, pinned"),
  ]);
  for (const r of [settings, followed, wishlist, dismissed, userIssues, pins]) if (r.error) throw r.error;

  const uis = (userIssues.data ?? []) as UserIssue[];
  const issueIds = uis.map((u) => u.issue_id);
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
  const openIds = uis.filter((u) => u.status !== "read" && u.status !== "dismissed").map((u) => u.issue_id);
  const myLinks = await inChunks<ArcLink>(openIds, (c) =>
    supabase.from("arc_issues").select("arc_id, issue_id, position").in("issue_id", c),
  );
  const arcIds = [...new Set(myLinks.map((a) => a.arc_id))];
  // Whole arcs, so the detail can say "Teil 2 von 5".
  const arcs = await inChunks<ArcLink>(arcIds, (c) =>
    supabase.from("arc_issues").select("arc_id, issue_id, position").in("arc_id", c),
  );
  const arcNames = await inChunks<{ id: number; name: string }>(arcIds, (c) =>
    supabase.from("arcs").select("id, name").in("id", c),
  );

  if (!settings.data) await supabase.from("settings").insert({});

  return {
    settings: (settings.data as Settings | null) ?? DEFAULT_SETTINGS,
    followed: (followed.data ?? []) as Followed[],
    wishlistSeries: (wishlist.data ?? []).map((w) => w.series_id),
    dismissed: (dismissed.data ?? []).map((d) => d.series_id),
    userIssues: new Map(uis.map((u) => [u.issue_id, u])),
    issues: new Map(issues.map((i) => [i.id, i])),
    series: new Map(series.map((s) => [s.id, s])),
    arcs,
    arcNames: new Map(arcNames.map((a) => [a.id, a.name])),
    pins: (pins.data ?? []) as PlanPin[],
  };
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(todayIso());

  // Catalog rows the screens fetched on their own, kept across reloads.
  const extra = useRef({ issues: new Map<number, Issue>(), series: new Map<number, Series>() });

  const reload = useCallback(async () => {
    try {
      const d = await load();
      for (const [id, i] of extra.current.issues) if (!d.issues.has(id)) d.issues.set(id, i);
      for (const [id, s] of extra.current.series) if (!d.series.has(id)) d.series.set(id, s);
      setData(d);
      setError(null);
      setToday(todayIso());
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const remember = useCallback((issues: Issue[], series: Series[]) => {
    for (const i of issues) extra.current.issues.set(i.id, i);
    for (const s of series) extra.current.series.set(s.id, s);
    setData((d) => {
      if (!d) return d;
      const im = new Map(d.issues);
      for (const i of issues) im.set(i.id, i);
      const sm = new Map(d.series);
      for (const s of series) sm.set(s.id, s);
      return { ...d, issues: im, series: sm };
    });
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const out: Item[] = [];
    for (const ui of data.userIssues.values()) {
      const issue = data.issues.get(ui.issue_id);
      if (!issue) continue;
      const from = readableFrom(issue.store_date, ui.format, ui.bought_on, data.settings.infinite_delay_days);
      out.push({ issue, series: data.series.get(issue.series_id), ui, readableFrom: from, readable: !!from && from <= today });
    }
    return out;
  }, [data, today]);

  const plan = useMemo<Evening[]>(() => {
    if (!data) return [];
    const arcsByIssue = new Map<number, { arcId: number; position: number }[]>();
    for (const a of data.arcs) {
      if (!arcsByIssue.has(a.issue_id)) arcsByIssue.set(a.issue_id, []);
      arcsByIssue.get(a.issue_id)!.push({ arcId: a.arc_id, position: a.position });
    }
    const open = items.filter((i) => (i.ui.status === "pile" || i.ui.status === "expected") && !i.ui.skip_plan);
    const planIssues: PlanIssue[] = open.map((i) => ({
      id: i.issue.id,
      seriesId: i.issue.series_id,
      sortNumber: i.issue.sort_number,
      storeDate: i.issue.store_date,
      oldPile: i.ui.old_pile,
      readableFrom: i.readableFrom,
      arcs: arcsByIssue.get(i.issue.id) ?? [],
    }));
    const openIds = new Set(open.map((i) => i.issue.id));
    const pins = data.pins
      .filter((p) => p.pinned && openIds.has(p.issue_id))
      .map((p) => ({ issueId: p.issue_id, evening: p.evening, slot: p.slot }));
    return buildPlan({ issues: planIssues, pins, today, maxPerEvening: data.settings.max_per_evening });
  }, [data, items, today]);

  const value = useMemo(() => ({ data, error, today, items, plan, reload, remember }), [data, error, today, items, plan, reload, remember]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

// ---- Mutations. Each one writes to Supabase; callers reload afterwards. ----

async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r;
}

export const actions = {
  markRead: (issueId: number, today: string) =>
    Promise.all([
      check(supabase.from("user_issues").update({ status: "read", read_on: today, updated_at: new Date().toISOString() }).eq("issue_id", issueId)),
      check(supabase.from("plan_entries").delete().eq("issue_id", issueId)),
    ]),
  markUnread: (issueId: number) =>
    check(supabase.from("user_issues").update({ status: "pile", read_on: null, rating: null }).eq("issue_id", issueId)),
  /** Read before the app knew about it: no reading date, never on the pile. */
  markReadEarlier: (issueId: number) =>
    check(supabase.from("user_issues").upsert({ issue_id: issueId, status: "read", format: null, read_on: null, skip_plan: false }, { onConflict: "user_id,issue_id" })),
  /** Marks every issue up to a number as read earlier, leaving the pile alone. */
  markReadUpTo: async (issueIds: number[]) => {
    const rows = issueIds.map((id) => ({ issue_id: id, status: "read", format: null, read_on: null, skip_plan: false }));
    for (let i = 0; i < rows.length; i += 500) {
      await check(supabase.from("user_issues").upsert(rows.slice(i, i + 500), { onConflict: "user_id,issue_id" }));
    }
  },
  rate: (issueId: number, rating: number | null) =>
    check(supabase.from("user_issues").update({ rating }).eq("issue_id", issueId)),
  pin: (issueId: number, evening: string, slot: number) =>
    check(supabase.from("plan_entries").upsert({ issue_id: issueId, evening, slot, pinned: true }, { onConflict: "user_id,issue_id" })),
  unpin: (issueId: number) => check(supabase.from("plan_entries").delete().eq("issue_id", issueId)),
  skipPlan: (issueId: number, skip: boolean) =>
    Promise.all([
      check(supabase.from("user_issues").update({ skip_plan: skip }).eq("issue_id", issueId)),
      check(supabase.from("plan_entries").delete().eq("issue_id", issueId)),
    ]),
  setBought: (issueId: number, boughtOn: string | null) =>
    check(supabase.from("user_issues").update({ bought_on: boughtOn }).eq("issue_id", issueId)),
  setFormat: (issueId: number, format: Format) =>
    check(supabase.from("user_issues").update({ format }).eq("issue_id", issueId)),
  addIssue: (issueId: number, status: "pile" | "wishlist", format: Format | null, extra: Partial<UserIssue> = {}) =>
    check(supabase.from("user_issues").upsert({ issue_id: issueId, status, format, ...extra }, { onConflict: "user_id,issue_id" })),
  removeIssue: (issueId: number) =>
    Promise.all([
      check(supabase.from("plan_entries").delete().eq("issue_id", issueId)),
      check(supabase.from("user_issues").delete().eq("issue_id", issueId)),
    ]),
  dismissIssue: (issueId: number) =>
    check(supabase.from("user_issues").update({ status: "dismissed" }).eq("issue_id", issueId)),
  follow: async (seriesId: number, format: Format) => {
    await check(supabase.from("followed_series").upsert({ series_id: seriesId, default_format: format }, { onConflict: "user_id,series_id" }));
    await check(supabase.from("wishlist_series").delete().eq("series_id", seriesId));
    await check(supabase.rpc("materialize_followed"));
  },
  unfollow: (seriesId: number) => check(supabase.from("followed_series").delete().eq("series_id", seriesId)),
  setPaused: (seriesId: number, paused: boolean) =>
    check(supabase.from("followed_series").update({ paused }).eq("series_id", seriesId)),
  setDefaultFormat: (seriesId: number, format: Format) =>
    check(supabase.from("followed_series").update({ default_format: format }).eq("series_id", seriesId)),
  wishSeries: (seriesId: number) =>
    check(supabase.from("wishlist_series").upsert({ series_id: seriesId }, { onConflict: "user_id,series_id" })),
  unwishSeries: (seriesId: number) => check(supabase.from("wishlist_series").delete().eq("series_id", seriesId)),
  dismissSuggestion: (seriesId: number) =>
    check(supabase.from("dismissed_suggestions").upsert({ series_id: seriesId }, { onConflict: "user_id,series_id" })),
  saveSettings: (s: Settings) => check(supabase.from("settings").upsert(s, { onConflict: "user_id" })),
};
