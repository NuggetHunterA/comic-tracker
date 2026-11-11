import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alignToEvenings, moveInList, planEvenings, releaseInList, readableFrom, sortList, stalledSeries, syncList, type Evening, type ListEntry, type ListRules, type PlanIssue } from "./plan";
import { supabase } from "./supabase";
import { todayIso } from "./dates";
import { eventOrder, insertAt } from "./events";
import { verlagOf } from "./publisher";
import { applyOp, enqueue, flushQueue, isNetworkError, loadQueue, loadSnapshot, saveQueue, saveSnapshot, type QueuedOp } from "./offline";
import type { EventIssue, EventRow, Followed, Format, Issue, Series, SeriesRank, Settings, UserIssue } from "./types";

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
  seriesOrder: SeriesRank[];
  /** The saved reading list, top to bottom. */
  readingList: ListEntry[];
  /** The rules the list was last sorted by (see rulesKey). */
  listRules: string | null;
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

/** No network: the app runs on the last saved state. */
export interface Offline {
  /** When that state was loaded (ISO timestamp), if known. */
  at: string | null;
}

interface Store {
  data: Data | null;
  error: string | null;
  /** Set while there is no network. */
  offline: Offline | null;
  /** Writes waiting for the network. */
  queued: QueuedOp[];
  /** How many waiting writes were just saved when the network came back (shown for a moment). */
  backOnline: number | null;
  /** "Gelesen" that waits for the network when there is none. */
  markRead: (issueId: number) => Promise<void>;
  /** A rating that waits for the network when there is none. */
  rate: (issueId: number, rating: number | null) => Promise<void>;
  today: string;
  items: Item[];
  plan: Evening[];
  /** The reading list as the plan uses it: saved order, new issues slotted in. */
  list: ListEntry[];
  /** Sorts the list again by the rules; issues moved by hand stay. */
  resort: () => Promise<void>;
  /** Moves an issue to a place in the list (0 is first). */
  moveTo: (issueId: number, index: number) => Promise<void>;
  /** Hands one issue moved by hand back to the rules, or all of them (a full sort). */
  release: (issueId?: number) => Promise<void>;
  events: EventView[];
  eventOf: Map<number, EventMark>;
  /** Series held up by an issue without a reading date, and how many issues wait behind it. */
  stalled: { issueId: number; behind: number }[];
  reload: () => Promise<void>;
  /** Merges catalog rows into the local cache, e.g. after a catalog query. */
  remember: (issues: Issue[], series: Series[]) => void;
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

async function load(): Promise<Data> {
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

/** The local copy with the waiting writes applied. */
function withOps(d: Data, ops: QueuedOp[]): Data {
  if (!ops.length) return d;
  const userIssues = new Map(d.userIssues);
  for (const op of ops) {
    const ui = applyOp(userIssues.get(op.issueId), op);
    if (ui) userIssues.set(op.issueId, ui);
  }
  return { ...d, userIssues };
}

function writeOp(op: QueuedOp): Promise<unknown> {
  return op.kind === "read" ? actions.markRead(op.issueId, op.day) : actions.rate(op.issueId, op.rating);
}

const message = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));

const Ctx = createContext<Store | null>(null);
const NO_LIST: ListEntry[] = [];
const NO_PLAN: Store["plan"] = [];
const NO_STALLED: Store["stalled"] = [];

/** The rules a sort goes by, as text: series ranking and every event's order. */
function rulesKey(ranks: SeriesRank[], events: EventView[]): string {
  const r = ranks.map((x) => `${x.series_id}${x.whole ? "*" : ""}`).join(",");
  const e = events.map((v) => `${v.event.id}:${v.order.map((i) => i.id).join(",")}`).join(";");
  return `v1|${r}|${e}`;
}

function sameList(a: ListEntry[], b: ListEntry[]): boolean {
  return a.length === b.length && a.every((e, k) => e.issueId === b[k].issueId && e.manual === b[k].manual && e.added === b[k].added);
}

/** Saves the list: rows that left are deleted, the rest get their place. */
async function writeList(prev: ListEntry[], next: ListEntry[]) {
  const keep = new Set(next.map((e) => e.issueId));
  const gone = prev.filter((e) => !keep.has(e.issueId)).map((e) => e.issueId);
  for (let i = 0; i < gone.length; i += 150) {
    await check(supabase.from("reading_list").delete().in("issue_id", gone.slice(i, i + 150)));
  }
  const rows = next.map((e, k) => ({ issue_id: e.issueId, position: k + 1, manual: e.manual, added: e.added }));
  for (let i = 0; i < rows.length; i += 500) {
    await check(supabase.from("reading_list").upsert(rows.slice(i, i + 500), { onConflict: "user_id,issue_id" }));
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(todayIso());
  const [offline, setOffline] = useState<Offline | null>(null);
  const [queued, setQueued] = useState<QueuedOp[]>([]);
  const [backOnline, setBackOnline] = useState<number | null>(null);

  // Catalog rows the screens fetched on their own, kept across reloads.
  const extra = useRef({ issues: new Map<number, Issue>(), series: new Map<number, Series>() });
  // The waiting writes, read from IndexedDB once.
  const queue = useRef<Promise<QueuedOp[]> | null>(null);
  const getQueue = () => (queue.current ??= loadQueue());
  const setQueue = (q: QueuedOp[]) => {
    queue.current = Promise.resolve(q);
    setQueued(q);
    void saveQueue(q);
  };
  const hasData = useRef(false);
  const flushing = useRef<Promise<number> | null>(null);
  const offlineRef = useRef<Offline | null>(null);
  const loadedAt = useRef<string | null>(null);
  const goOffline = (o: Offline) => {
    offlineRef.current = o;
    setOffline(o);
  };

  const reload = useCallback(async () => {
    setToday(todayIso());
    // One flush at a time: the online event and a visibility change often come together.
    flushing.current ??= (async () => {
      const q = await getQueue();
      setQueued(q);
      if (!q.length || !navigator.onLine) return 0;
      const r = await flushQueue(q, writeOp);
      // A write the server refuses would block the queue forever: drop it and say so.
      const refused = r.error && !isNetworkError(r.error);
      if (r.done || refused) setQueue(refused ? r.left.slice(1) : r.left);
      if (refused) setError(message(r.error));
      return r.done;
    })().finally(() => { flushing.current = null; });
    const saved = await flushing.current;
    const q = await getQueue();
    try {
      const d = await load();
      for (const [id, i] of extra.current.issues) if (!d.issues.has(id)) d.issues.set(id, i);
      for (const [id, s] of extra.current.series) if (!d.series.has(id)) d.series.set(id, s);
      const at = new Date().toISOString();
      loadedAt.current = at;
      void saveSnapshot(d, at);
      setData(withOps(d, q));
      hasData.current = true;
      setError(null);
      if (offlineRef.current || saved) {
        setBackOnline(saved);
        window.setTimeout(() => setBackOnline(null), 4000);
      }
      offlineRef.current = null;
      setOffline(null);
    } catch (e) {
      if (!isNetworkError(e)) {
        setError(message(e));
        return;
      }
      if (!hasData.current) {
        const snap = await loadSnapshot<Data>();
        if (snap) {
          loadedAt.current = snap.at;
          setData(withOps(snap.data, q));
          hasData.current = true;
        } else setError("Kein Netz, und auf diesem Gerät ist noch kein Stand gespeichert.");
      }
      goOffline({ at: loadedAt.current });
    }
  }, []);

  useEffect(() => {
    void reload();
    const onVisible = () => document.visibilityState === "visible" && void reload();
    const onOnline = () => void reload();
    const onOffline = () => hasData.current && goOffline({ at: loadedAt.current });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reload]);

  /** Writes now, or keeps the write for later when there is no network. */
  const later = useCallback(async (op: QueuedOp) => {
    if (!offlineRef.current) {
      try {
        await writeOp(op);
        return;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    setQueue(enqueue(await getQueue(), op));
    setData((d) => (d ? withOps(d, [op]) : d));
    goOffline({ at: loadedAt.current });
  }, []);
  const markRead = useCallback((issueId: number) => later({ kind: "read", issueId, day: todayIso() }), [later]);
  const rate = useCallback((issueId: number, rating: number | null) => later({ kind: "rate", issueId, rating }), [later]);

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
      const from = readableFrom(issue.store_date, ui.format, ui.bought_on, data.settings.infinite_delay_days, data.settings.webtoon_delay_days);
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

  const planned = useMemo(() => {
    if (!data) return null;
    // Started events go first, the one read in most recently ahead.
    const lastRead = (v: EventView) => v.order.reduce((m, i) => {
      const ui = data.userIssues.get(i.id);
      return ui?.status === "read" && (ui.read_on ?? "0000") > m ? ui.read_on ?? "0000" : m;
    }, "");
    const startedEvents = events.filter((v) => v.read > 0).sort((a, b) => lastRead(b).localeCompare(lastRead(a))).map((v) => v.event.id);
    const open = items.filter((i) => i.ui.status === "pile" && !i.ui.skip_plan);
    const planIssues: PlanIssue[] = open.map((i) => ({
      id: i.issue.id,
      seriesId: i.issue.series_id,
      sortNumber: i.issue.sort_number,
      storeDate: i.issue.store_date,
      oldPile: i.ui.old_pile,
      readableFrom: i.readableFrom,
      event: eventOf.has(i.issue.id) ? { id: eventOf.get(i.issue.id)!.event.id, position: eventOf.get(i.issue.id)!.part } : null,
      publisher: verlagOf(i.series),
    }));
    const order = {
      ranked: data.seriesOrder.map((r) => r.series_id),
      whole: new Set(data.seriesOrder.filter((r) => r.whole).map((r) => r.series_id)),
    };
    const rules: ListRules = { order, startedEvents };
    const key = rulesKey(data.seriesOrder, events);
    // Changed rules sort the list again; otherwise new issues are only slotted in.
    const readTodayItems = items.filter((i) => i.ui.status === "read" && i.ui.read_on === today);
    const readToday = readTodayItems.length;
    // Tonight keeps to the publisher already read today.
    const readTodayPublisher = readTodayItems.length ? verlagOf(readTodayItems[readTodayItems.length - 1].series) : undefined;
    const evenings = (l: ListEntry[]) =>
      planEvenings({ list: l, issues: planIssues, today, maxPerEvening: data.settings.max_per_evening, readToday, readTodayPublisher });
    // A full sort writes the list in the order the evenings read it, so an issue
    // pulled forward to fill an evening stands next to that evening.
    const sorted = (prev?: ListEntry[]) => {
      const l = sortList(planIssues, rules, prev);
      return alignToEvenings(l, evenings(l));
    };
    const list = data.listRules === key ? syncList(data.readingList, planIssues, rules) : sorted(data.readingList);
    return {
      key,
      rules,
      planIssues,
      list,
      sorted,
      plan: evenings(list),
      stalled: stalledSeries(planIssues).map((s) => ({ issueId: s.issue.id, behind: s.behind })),
    };
  }, [data, items, today, events, eventOf]);

  // Keeps the saved list in step with what the plan uses.
  const saving = useRef(false);
  const save = useCallback(async (next: ListEntry[], key: string) => {
    if (!data) return;
    const prev = data.readingList;
    saving.current = true;
    setData((d) => (d ? { ...d, readingList: next, listRules: key } : d));
    try {
      await writeList(prev, next);
      if (data.listRules !== key) await check(supabase.from("settings").upsert({ list_rules: key }, { onConflict: "user_id" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e));
    } finally {
      saving.current = false;
    }
  }, [data]);
  useEffect(() => {
    // Without network the list is only kept on screen; it is saved once the network is back.
    if (!data || !planned || saving.current || offline) return;
    if (data.listRules === planned.key && sameList(data.readingList, planned.list)) return;
    void save(planned.list, planned.key);
  }, [data, planned, save, offline]);

  const resort = useCallback(async () => {
    if (!planned) return;
    await save(planned.sorted(planned.list), planned.key);
  }, [planned, save]);
  const moveTo = useCallback(async (issueId: number, index: number) => {
    if (!planned) return;
    await save(moveInList(planned.list, issueId, index), planned.key);
  }, [planned, save]);

  const release = useCallback(async (issueId?: number) => {
    if (!planned) return;
    const next = issueId === undefined ? planned.sorted() : releaseInList(planned.list, issueId, planned.planIssues);
    await save(next, planned.key);
  }, [planned, save]);

  const plan = planned?.plan ?? NO_PLAN;
  const stalled = planned?.stalled ?? NO_STALLED;
  const list = planned?.list ?? NO_LIST;

  const value = useMemo(
    () => ({ data, error, offline, queued, backOnline, markRead, rate, today, items, plan, list, resort, moveTo, release, events, eventOf, stalled, reload, remember }),
    [data, error, offline, queued, backOnline, markRead, rate, today, items, plan, list, resort, moveTo, release, events, eventOf, stalled, reload, remember],
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
    check(supabase.from("user_issues").update({ status: "read", read_on: today, updated_at: new Date().toISOString() }).eq("issue_id", issueId)),
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
  skipPlan: (issueId: number, skip: boolean) =>
    check(supabase.from("user_issues").update({ skip_plan: skip }).eq("issue_id", issueId)),
  setBought: (issueId: number, boughtOn: string | null) =>
    check(supabase.from("user_issues").update({ bought_on: boughtOn }).eq("issue_id", issueId)),
  setFormat: (issueId: number, format: Format) =>
    check(supabase.from("user_issues").update({ format }).eq("issue_id", issueId)),
  addIssue: (issueId: number, status: "pile" | "wishlist", format: Format | null, extra: Partial<UserIssue> = {}) =>
    check(supabase.from("user_issues").upsert({ issue_id: issueId, status, format, ...extra }, { onConflict: "user_id,issue_id" })),
  removeIssue: (issueId: number) =>
    check(supabase.from("user_issues").delete().eq("issue_id", issueId)),
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
