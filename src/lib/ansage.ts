// Ansage: Adrian says what he wants to read ("alle Absolute Green Arrow als
// Nächstes", "heute Marvel"), Claude picks the issues from the pile, the app
// shows the plan that would follow, and "Übernehmen" puts them on top.
import type { ListEntry } from "./plan";
import type { Item, EventMark } from "./store";
import { verlagOf } from "./publisher";
import { seriesLong } from "./labels";
import { Hinweis } from "./errors";
import { supabase } from "./supabase";

/** Claude's answer: one short sentence, and the issues to put on top, in reading order. */
export interface AnsageAnswer {
  reply: string;
  issueIds: number[];
}

/**
 * The pile as Claude sees it: one line per open issue, in the current reading
 * order. Only what a wish can refer to: series, number, publisher, format,
 * when it is readable, its event.
 */
export function pileLines(list: ListEntry[], items: Item[], eventOf: Map<number, EventMark>, today: string): string[] {
  const byId = new Map(items.map((i) => [i.issue.id, i]));
  return list.flatMap((e, k) => {
    const i = byId.get(e.issueId);
    if (!i) return [];
    const ev = eventOf.get(i.issue.id);
    const when = i.readable ? "lesbar" : i.readableFrom && i.readableFrom > today ? `lesbar ab ${i.readableFrom}` : "noch nicht lesbar";
    return [[
      i.issue.id,
      `${seriesLong(i.series)} #${i.issue.number}`,
      verlagOf(i.series),
      i.ui.format,
      when,
      ev ? `Event ${ev.event.name} Teil ${ev.part}` : "",
      e.manual ? "von Hand" : "",
      `Platz ${k + 1}`,
    ].filter(Boolean).join(" | ")];
  });
}

/**
 * Puts the issues on top of the list in the given order, each moved by hand,
 * so later sorts leave them there. Everything else keeps its order.
 */
export function pullUp(list: ListEntry[], issueIds: number[]): ListEntry[] {
  const known = new Set(list.map((e) => e.issueId));
  const ids = [...new Set(issueIds)].filter((id) => known.has(id));
  const up = new Set(ids);
  return [...ids.map((issueId) => ({ issueId, manual: true, added: false })), ...list.filter((e) => !up.has(e.issueId))];
}

/** Sends the wish and the pile to the ansage edge function (Claude). */
export async function askClaude(text: string, pile: string[], today: string): Promise<AnsageAnswer> {
  const { data, error } = await supabase.functions.invoke("ansage", { body: { text, pile, today } });
  if (error) {
    const res = (error as { context?: Response }).context;
    const detail = res && (res.status === 400 || res.status === 429) ? await res.json?.().catch(() => null) : null;
    if (detail?.error) throw new Hinweis(detail.error);
    throw error;
  }
  const a = data as Partial<AnsageAnswer>;
  return { reply: String(a.reply ?? ""), issueIds: Array.isArray(a.issueIds) ? a.issueIds.filter((x): x is number => typeof x === "number") : [] };
}
