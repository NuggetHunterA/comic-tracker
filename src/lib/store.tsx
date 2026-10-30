import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildPlan, readableFrom, stalledSeries, type Evening, type PlanIssue } from "./plan";
import { supabase } from "./supabase";
import { todayIso } from "./dates";
import { eventOrder, insertAt } from "./events";
import type { EventIssue, EventRow, Followed, Format, Issue, PlanPin, Series, SeriesRank, Settings, UserIssue } from "./types";

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
  events: EventRow[];
  eventIssues: EventIssue[];
  pins: PlanPin[];
  seriesOrder: SeriesRank[];
}

/** An event with its issues in reading order. */
export interface EventView {
  event: EventRow;
  order: Issue[];
  read: number;
}

/** Every issue read. A fresh, empty event is not done. */
export function eventDone(v: EventView): boolean {
  return v.order.length > 0 && v.read === v.order.length;
}

/** Where an issue sits in its event, for the markers. */
export interface EventMark {
  event: EventRow;
  part: number;
  total: number;
}

interface Store {
  data: Data | null;
  error: string | null;
  today: string;
  items: Item[];
  plan: Evening[];
  events: EventView[];
  eventOf: Map<number, EventMark>;
  /** Series held up by an issue without a reading date, and how many issues wait behind it. */
  stalled: { issueId: number; behind: number }[];
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
  const [settings, followed, wishlist, dismissed, userIssues, pins, events, eventIssues, seriesOrder] = await Promise.all([
    supabase.from("settings").select("infinite_delay_days, max_per_evening").maybeSingle(),
    supabase.from("followed_series").select("series_id, default_format, paused, created_at"),
    supabase.from("wishlist_series").select("series_id"),
    supabase.from("dismissed_suggestions").select("series_id"),
    supabase.from("user_issues").select("issue_id, status, format, old_pile, bought_on, read_on, rating, skip_plan"),
    supabase.from("plan_entries").select("issue_id, evening, slot, pinned"),
    supabase.from("events").select("id, name, short, color, manual_order, created_at").order("created_at"),
    supabase.from("event_issues").select("event_id, issue_id, position"),
    supabase.from("series_order").select("series_id, position, whole").order("position"),
  ]);
  for (const r of [settings, followed, wishlist, dismissed, userIssues, pins, events, eventIssues, seriesOrder]) if (r.error) throw r.error;

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

  return {
    settings: (settings.data as Settings | null) ?? DEFAULT_SETTINGS,
    followed: (followed.data ?? []) as Followed[],
    wishlistSeries: (wishlist.data ?? []).map((w) => w.series_id),
    dismissed: (dismissed.data ?? []).map((d) => d.series_id),
    userIssues: new Map(uis.map((u) => [u.issue_id, u])),
    issues: new Map(issues.map((i) => [i.id, i])),
    series: new Map(series.map((s) => [s.id, s])),
    events: (events.data ?? []) as EventRow[],
    eventIssues: links,
    pins: (pins.data ?? []) as PlanPin[],
    seriesOrder: (seriesOrder.data ?? []) as SeriesRank[],
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

  const { events, eventOf } = useMemo(() => {
    const views: EventView[] = [];
    const marks = new Map<number, EventMark>();
    if (!data) return { events: views, eventOf: marks };
    for (const event of data.events) {
      const order = eventOrder(event, data.eventIssues, data.issues);
      order.forEach((i, k) => marks.set(i.id, { event, part: k + 1, total: order.length }));
      views.push({ event, order, read: order.filter((i) => data.userIssues.get(i.id)?.status === "read").length });
    }
    return { events: views, eventOf: marks };
  }, [data]);

  const { plan, stalled } = useMemo(() => {
    if (!data) return { plan: [] as Evening[], stalled: [] };
    // Started events go first, the one read in most recently ahead.
    const lastRead = (v: EventView) => v.order.reduce((m, i) => {
      const ui = data.userIssues.get(i.id);
      return ui?.status === "read" && (ui.read_on ?? "0000") > m ? ui.read_on ?? "0000" : m;
    }, "");
    const startedEvents = events.filter((v) => v.read > 0).sort((a, b) => lastRead(b).localeCompare(lastRead(a))).map((v) => v.event.id);
    const open = items.filter((i) => (i.ui.status === "pile" || i.ui.status === "expected") && !i.ui.skip_plan);
    const planIssues: PlanIssue[] = open.map((i) => ({
      id: i.issue.id,
      seriesId: i.issue.series_id,
      sortNumber: i.issue.sort_number,
      storeDate: i.issue.store_date,
      oldPile: i.ui.old_pile,
      readableFrom: i.readableFrom,
      event: eventOf.has(i.issue.id) ? { id: eventOf.get(i.issue.id)!.event.id, position: eventOf.get(i.issue.id)!.part } : null,
    }));
    const openIds = new Set(open.map((i) => i.issue.id));
    const pins = data.pins
      .filter((p) => p.pinned && openIds.has(p.issue_id))
      .map((p) => ({ issueId: p.issue_id, evening: p.evening, slot: p.slot }));
    const order = {
      ranked: data.seriesOrder.map((r) => r.series_id),
      whole: new Set(data.seriesOrder.filter((r) => r.whole).map((r) => r.series_id)),
    };
    return {
      plan: buildPlan({ issues: planIssues, pins, today, maxPerEvening: data.settings.max_per_evening, startedEvents, order }),
      stalled: stalledSeries(planIssues).map((s) => ({ issueId: s.issue.id, behind: s.behind })),
    };
  }, [data, items, today, events, eventOf]);

  const value = useMemo(
    () => ({ data, error, today, items, plan, events, eventOf, stalled, reload, remember }),
    [data, error, today, items, plan, events, eventOf, stalled, reload, remember],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The store where there may be none (a cover drawn outside the app shell). */
export function useMaybeStore(): Store | null {
  return useContext(Ctx);
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
  /** Puts a run of issues on the pile as regular (not old pile) issues. */
  pileAll: async (issueIds: number[], format: Format) => {
    const rows = issueIds.map((id) => ({ issue_id: id, status: "pile", format, old_pile: false, bought_on: null, read_on: null, skip_plan: false }));
    for (let i = 0; i < rows.length; i += 500) {
      await check(supabase.from("user_issues").upsert(rows.slice(i, i + 500), { onConflict: "user_id,issue_id" }));
    }
  },
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
  createEvent: async (name: string, short: string, color: string): Promise<number> => {
    const { data } = await check(supabase.from("events").insert({ name, short, color }).select("id").single());
    return (data as { id: number }).id;
  },
  updateEvent: (eventId: number, patch: Partial<Pick<EventRow, "name" | "short" | "color">>) =>
    check(supabase.from("events").update(patch).eq("id", eventId)),
  deleteEvent: (eventId: number) => check(supabase.from("events").delete().eq("id", eventId)),
  /**
   * Adds an issue to an event (moving it out of another one) and onto the
   * pile if it is not there yet. In an event sorted by hand it goes in by its
   * date; read issues stay read.
   */
  addToEvent: async (view: EventView, issue: Issue, ui: UserIssue | undefined, format: Format) => {
    if (!ui || ui.status === "wishlist" || ui.status === "dismissed") {
      await check(supabase.from("user_issues").upsert({ issue_id: issue.id, status: "pile", format, skip_plan: false }, { onConflict: "user_id,issue_id" }));
    }
    const order = view.order.filter((i) => i.id !== issue.id);
    if (!view.event.manual_order) {
      await check(supabase.from("event_issues").upsert({ event_id: view.event.id, issue_id: issue.id, position: 0 }, { onConflict: "user_id,issue_id" }));
      return;
    }
    order.splice(insertAt(order, issue), 0, issue);
    await check(supabase.from("event_issues").upsert(order.map((i, k) => ({ event_id: view.event.id, issue_id: i.id, position: k + 1 })), { onConflict: "user_id,issue_id" }));
  },
  removeFromEvent: (issueId: number) => check(supabase.from("event_issues").delete().eq("issue_id", issueId)),
  /** Keeps the event in this order from now on. */
  reorderEvent: async (eventId: number, issueIds: number[]) => {
    await check(supabase.from("event_issues").upsert(issueIds.map((id, k) => ({ event_id: eventId, issue_id: id, position: k + 1 })), { onConflict: "user_id,issue_id" }));
    await check(supabase.from("events").update({ manual_order: true }).eq("id", eventId));
  },
  /** Keeps the series in this order; the first `whole` of them are read to the end in one go. */
  orderSeries: async (seriesIds: number[], whole: number) => {
    await check(supabase.from("series_order").delete().gte("position", 0));
    await check(supabase.from("series_order").insert(seriesIds.map((id, k) => ({ series_id: id, position: k + 1, whole: k < whole }))));
  },
  /** Back to date order: the plan forgets the ranking. */
  sortSeriesByDate: () => check(supabase.from("series_order").delete().gte("position", 0)),
  sortEventByDate: (eventId: number) => check(supabase.from("events").update({ manual_order: false }).eq("id", eventId)),
};
