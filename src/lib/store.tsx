// The app's data: loads it (load.ts), derives items and events, keeps the
// reading list in sync (listSync.ts). Writes live in actions.ts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readableFrom, type Evening, type ListEntry } from "./plan";
import { todayIso } from "./dates";
import { noteRead } from "./moments";
import { eventOrder, type EventMark, type EventView } from "./events";
import { load, type Data } from "./load";
import { useListSync } from "./listSync";
import { actions } from "./actions";
import { applyOp, enqueue, flushQueue, isNetworkError, loadQueue, loadSnapshot, saveQueue, saveSnapshot, type QueuedOp } from "./offline";
import type { Issue, Series, UserIssue } from "./types";

export { actions } from "./actions";
export { eventDone, type EventMark, type EventView } from "./events";
export type { Data } from "./load";

export interface Item {
  issue: Issue;
  series: Series | undefined;
  ui: UserIssue;
  readableFrom: string | null;
  readable: boolean;
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
  /**
   * Takes back writes for an issue that still wait for the network and puts the
   * local copy back to `before`. True when a waiting "Gelesen" was among them.
   */
  takeBack: (issueId: number, before: Partial<UserIssue>) => Promise<boolean>;
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
  /** Ansage: the evenings with these issues on top, without saving. */
  previewUp: (issueIds: number[]) => Evening[];
  /** Ansage: puts these issues on top (moved by hand); resolves to the list before. */
  pullUp: (issueIds: number[]) => Promise<ListEntry[]>;
  /** Ansage undo: puts a list back. */
  restoreList: (list: ListEntry[]) => Promise<void>;
  events: EventView[];
  eventOf: Map<number, EventMark>;
  /** Series held up by an issue without a reading date, and how many issues wait behind it. */
  stalled: { issueId: number; behind: number }[];
  reload: () => Promise<void>;
  /** Merges catalog rows into the local cache, e.g. after a catalog query. */
  remember: (issues: Issue[], series: Series[]) => void;
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
  const markRead = useCallback((issueId: number) => {
    noteRead();
    return later({ kind: "read", issueId, day: todayIso() });
  }, [later]);
  const rate = useCallback((issueId: number, rating: number | null) => later({ kind: "rate", issueId, rating }), [later]);
  const takeBack = useCallback(async (issueId: number, before: Partial<UserIssue>) => {
    const q = await getQueue();
    const mine = q.filter((o) => o.issueId === issueId);
    if (!mine.length) return false;
    setQueue(q.filter((o) => o.issueId !== issueId));
    setData((d) => {
      const ui = d?.userIssues.get(issueId);
      if (!d || !ui) return d;
      const userIssues = new Map(d.userIssues);
      userIssues.set(issueId, { ...ui, ...before });
      return { ...d, userIssues };
    });
    return mine.some((o) => o.kind === "read");
  }, []);

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

  const { plan, list, stalled, resort, moveTo, release, previewUp, pullUp, restoreList } = useListSync(data, setData, setError, items, today, events, eventOf, offline !== null);

  const value = useMemo(
    () => ({ data, error, offline, queued, backOnline, markRead, rate, takeBack, today, items, plan, list, resort, moveTo, release, previewUp, pullUp, restoreList, events, eventOf, stalled, reload, remember }),
    [data, error, offline, queued, backOnline, markRead, rate, takeBack, today, items, plan, list, resort, moveTo, release, previewUp, pullUp, restoreList, events, eventOf, stalled, reload, remember],
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

