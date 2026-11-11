// The Archivkiste: older issues from the subscriptions, in envelopes the Metron
// sync fills (supabase/functions/metron, fillArchive). The plan shows the box in
// a thin week (three envelopes with hints), on an empty evening (one blind
// envelope for tonight) and around Halloween and Christmas (one tinted envelope).
import { addDays, weekStart } from "./dates";
import { moveInList, type Evening, type ListEntry } from "./plan";
import { check } from "./actions";
import { writeList } from "./listSync";
import { supabase } from "./supabase";
import type { ArchiveSuggestion, Format, UserIssue } from "./types";

/** Days ahead the box looks at, and how many of them must be empty for it to show. */
export const THIN_DAYS = 7;
export const THIN_MIN_FREE = 2;
const BOX_SIZE = 3;

export type Season = "hw" | "xm";

/** Halloween from 15 to 31 October, Christmas from 1 to 26 December. */
export function seasonOf(today: string): Season | null {
  const md = today.slice(5);
  if (md >= "10-15" && md <= "10-31") return "hw";
  if (md >= "12-01" && md <= "12-26") return "xm";
  return null;
}

/** The next THIN_DAYS evenings after tonight, and which of them the plan leaves empty. */
export function nextDays(plan: Evening[], today: string): { date: string; free: boolean }[] {
  const used = new Set(plan.filter((e) => e.entries.length).map((e) => e.date));
  return Array.from({ length: THIN_DAYS }, (_, k) => {
    const date = addDays(today, k + 1);
    return { date, free: !used.has(date) };
  });
}

/** Envelopes for the box, at most three: an anniversary one of this week last. */
export function boxEnvelopes(archive: ArchiveSuggestion[], today: string, skip?: number): ArchiveSuggestion[] {
  const week = weekStart(today);
  const open = archive.filter((a) => a.status === "open" && a.id !== skip && a.kind !== "season");
  const anniversary = open.find((a) => a.kind === "anniversary" && a.valid_from === week);
  const runs = open.filter((a) => a.kind === "writer" || a.kind === "classic");
  return [...runs.slice(0, anniversary ? BOX_SIZE - 1 : BOX_SIZE), ...(anniversary ? [anniversary] : [])];
}

/** The blind envelope for an empty evening: one run from the box, the same all day. */
export function blindEnvelope(archive: ArchiveSuggestion[], today: string): ArchiveSuggestion | null {
  const runs = archive.filter((a) => a.status === "open" && (a.kind === "writer" || a.kind === "classic"));
  if (!runs.length) return null;
  const n = Number(today.replace(/-/g, ""));
  return runs[n % runs.length];
}

/** This season's envelope, while it is still in the box. */
export function seasonEnvelope(archive: ArchiveSuggestion[], today: string): ArchiveSuggestion | null {
  const s = seasonOf(today);
  if (!s) return null;
  return archive.find((a) => a.kind === "season" && a.season === s && a.status === "open" && (a.valid_from ?? "").slice(0, 4) === today.slice(0, 4)) ?? null;
}

/** A taken run whose later issues are not on the pile yet, by the issue that was taken. */
export function restOf(archive: ArchiveSuggestion[], issueId: number): { envelope: ArchiveSuggestion; rest: number[] } | null {
  for (const a of archive) {
    if (a.status !== "taken" || a.taken_count >= a.issue_ids.length) continue;
    if (a.issue_ids.slice(0, a.taken_count).includes(issueId)) return { envelope: a, rest: a.issue_ids.slice(a.taken_count) };
  }
  return null;
}

/** What each taken archive issue came from, for the tags on the evening rows. */
export function archiveKinds(archive: ArchiveSuggestion[]): Map<number, ArchiveSuggestion> {
  const out = new Map<number, ArchiveSuggestion>();
  for (const a of archive) if (a.status === "taken") for (const id of a.issue_ids) out.set(id, a);
  return out;
}

/** Where "the next evening" starts in the list: before the first issue of the first evening after tonight. */
export function nextEveningIndex(list: ListEntry[], plan: Evening[], today: string): number {
  const first = plan.find((e) => e.date > today && e.entries.length)?.entries[0]?.issueId;
  const at = first === undefined ? -1 : list.findIndex((e) => e.issueId === first);
  return at < 0 ? list.length : at;
}

export const archiveActions = {
  /**
   * Puts issues of a run on the pile as archive issues; issues already on the
   * pile or read stay as they are.
   */
  take: async (envelope: ArchiveSuggestion, issueIds: number[], format: Format, owned: Map<number, UserIssue>) => {
    const rows = issueIds
      .filter((id) => !owned.has(id) || owned.get(id)!.status === "wishlist" || owned.get(id)!.status === "dismissed")
      .map((id) => ({ issue_id: id, status: "pile", format, old_pile: false, bought_on: null, read_on: null, skip_plan: false, archive: true }));
    if (rows.length) await check(supabase.from("user_issues").upsert(rows, { onConflict: "user_id,issue_id" }));
    const taken = Math.min(envelope.issue_ids.length, envelope.taken_count + issueIds.length);
    await check(supabase.from("archive_suggestions").update({ status: "taken", taken_count: taken, decided_at: new Date().toISOString() }).eq("id", envelope.id));
  },
  /** Back in the box: it may come again after a while. */
  putBack: (envelope: ArchiveSuggestion) =>
    check(supabase.from("archive_suggestions").update({ status: "back", decided_at: new Date().toISOString() }).eq("id", envelope.id)),
  /** Not in the subscription: never suggested again. */
  never: (envelope: ArchiveSuggestion) =>
    check(supabase.from("archive_suggestions").update({ status: "never", decided_at: new Date().toISOString() }).eq("id", envelope.id)),
  /** Puts an issue at a place in the reading list, marked as moved by hand. */
  place: (list: ListEntry[], issueId: number, index: number) => writeList(list, moveInList(list, issueId, index)),
};
