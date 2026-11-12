// Mutations. Each one writes to Supabase; callers reload afterwards.
import { insertAt, type EventView } from "./events";
import { supabase } from "./supabase";
import type { EventRow, Format, Issue, Settings, UserIssue } from "./types";

export async function check<T extends { error: unknown }>(p: PromiseLike<T>): Promise<T> {
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
  sortEventByDate: (eventId: number) => check(supabase.from("events").update({ manual_order: false }).eq("id", eventId)),
};
