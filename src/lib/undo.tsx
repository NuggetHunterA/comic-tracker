import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { useStore } from "./store";
import { report } from "./errors";
import { issueTitle } from "./labels";
import type { ListEntry } from "./plan";
import type { UserIssue } from "./types";

/** What an issue looked like before "Gelesen", so it can be put back exactly. */
export interface ReadUndo {
  issueId: number;
  title: string;
  before: Pick<UserIssue, "status" | "read_on" | "rating">;
  /** Its place in the reading list, if it had one. */
  slot: { index: number; entry: ListEntry } | null;
}

interface UndoCtx {
  offer: ReadUndo | null;
  /** Takes the snapshot; call it right before marking the issue read. */
  snapshot: (issueId: number) => ReadUndo | null;
  /** Shows the strip for a read that went through. */
  offerRead: (u: ReadUndo) => void;
  dismiss: () => void;
  undo: () => Promise<boolean>;
  busy: boolean;
  error: string | null;
}

const Ctx = createContext<UndoCtx | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const { data, list, reload } = useStore();
  const [offer, setOffer] = useState<ReadUndo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = useCallback((issueId: number): ReadUndo | null => {
    const ui = data?.userIssues.get(issueId);
    const issue = data?.issues.get(issueId);
    if (!ui || !issue) return null;
    const index = list.findIndex((e) => e.issueId === issueId);
    return {
      issueId,
      title: issueTitle(issue, data?.series.get(issue.series_id)),
      before: { status: ui.status, read_on: ui.read_on, rating: ui.rating },
      slot: index >= 0 ? { index, entry: list[index] } : null,
    };
  }, [data, list]);

  const offerRead = useCallback((u: ReadUndo) => {
    setError(null);
    setOffer(u);
  }, []);
  const dismiss = useCallback(() => {
    setOffer(null);
    setError(null);
  }, []);

  const undo = useCallback(async () => {
    if (!offer) return false;
    setBusy(true);
    setError(null);
    try {
      const { error: e1 } = await supabase.from("user_issues").update(offer.before).eq("issue_id", offer.issueId);
      if (e1) throw e1;
      if (offer.slot) {
        // Back to its old place, with its old pin, so the evenings come out as before.
        const next = list.filter((e) => e.issueId !== offer.issueId);
        next.splice(Math.min(offer.slot.index, next.length), 0, offer.slot.entry);
        const rows = next.map((e, k) => ({ issue_id: e.issueId, position: k + 1, manual: e.manual, added: e.added }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error: e2 } = await supabase.from("reading_list").upsert(rows.slice(i, i + 500), { onConflict: "user_id,issue_id" });
          if (e2) throw e2;
        }
      }
      await reload();
      setOffer(null);
      return true;
    } catch (e) {
      setError(report(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [offer, list, reload]);

  const value = useMemo(
    () => ({ offer, snapshot, offerRead, dismiss, undo, busy, error }),
    [offer, snapshot, offerRead, dismiss, undo, busy, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUndo(): UndoCtx {
  const u = useContext(Ctx);
  if (!u) throw new Error("UndoProvider missing");
  return u;
}
