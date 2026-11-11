// The app's data: loads it (load.ts), derives items and events, keeps the
// reading list in sync (listSync.ts). Writes live in actions.ts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readableFrom, type Evening, type ListEntry } from "./plan";
import { todayIso } from "./dates";
import { eventOrder, type EventMark, type EventView } from "./events";
import { load, type Data } from "./load";
import { useListSync } from "./listSync";
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

interface Store {
  data: Data | null;
  error: string | null;
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

  const { plan, list, stalled, resort, moveTo, release } = useListSync(data, setData, setError, items, today, events, eventOf);

  const value = useMemo(
    () => ({ data, error, today, items, plan, list, resort, moveTo, release, events, eventOf, stalled, reload, remember }),
    [data, error, today, items, plan, list, resort, moveTo, release, events, eventOf, stalled, reload, remember],
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

