// Reading-list sync: works out the plan from the loaded data and keeps the
// saved reading list (and the rules it was sorted by) in step with it.
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { alignToEvenings, moveInList, planEvenings, releaseInList, sortList, stalledSeries, syncList, type Evening, type ListEntry, type ListRules, type PlanIssue } from "./plan";
import { supabase } from "./supabase";
import { check } from "./actions";
import type { EventMark, EventView } from "./events";
import type { Data } from "./load";
import { verlagOf } from "./publisher";
import type { SeriesRank } from "./types";
import type { Item } from "./store";

const NO_LIST: ListEntry[] = [];
const NO_PLAN: Evening[] = [];
const NO_STALLED: { issueId: number; behind: number }[] = [];

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

export interface ListSync {
  plan: Evening[];
  list: ListEntry[];
  stalled: { issueId: number; behind: number }[];
  resort: () => Promise<void>;
  moveTo: (issueId: number, index: number) => Promise<void>;
  release: (issueId?: number) => Promise<void>;
}

export function useListSync(
  data: Data | null,
  setData: Dispatch<SetStateAction<Data | null>>,
  setError: (e: string) => void,
  items: Item[],
  today: string,
  events: EventView[],
  eventOf: Map<number, EventMark>,
): ListSync {
  const planned = useMemo(() => {
    if (!data) return null;
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
  }, [data, setData, setError]);
  useEffect(() => {
    if (!data || !planned || saving.current) return;
    if (data.listRules === planned.key && sameList(data.readingList, planned.list)) return;
    void save(planned.list, planned.key);
  }, [data, planned, save]);

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

  return {
    plan: planned?.plan ?? NO_PLAN,
    list: planned?.list ?? NO_LIST,
    stalled: planned?.stalled ?? NO_STALLED,
    resort,
    moveTo,
    release,
  };
}
