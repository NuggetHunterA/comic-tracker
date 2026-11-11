import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface SyncRun {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
}

export interface SyncStatus {
  /** When Metron was last synced without an error. */
  lastOk: string | null;
  /** True when that is too long ago or the newest run failed. */
  stuck: boolean;
}

/** The sync runs hourly; three missed hours mean something is wrong. */
export const STUCK_AFTER_MS = 3 * 60 * 60 * 1000;

/** Reads the state from the newest finished runs (newest first). */
export function syncStatus(runs: SyncRun[], now = Date.now()): SyncStatus | null {
  const done = runs.filter((r) => r.finished_at);
  if (!done.length) return null;
  const ok = done.find((r) => r.ok);
  const lastOk = ok?.finished_at ?? null;
  const stuck = done[0].ok === false || !lastOk || now - new Date(lastOk).getTime() > STUCK_AFTER_MS;
  return { lastOk, stuck };
}

/** The Metron sync state from comics.sync_runs; null until loaded or when it cannot be read. */
export function useSyncStatus(key: unknown): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    let stale = false;
    supabase
      .from("sync_runs")
      .select("started_at, finished_at, ok")
      .not("finished_at", "is", null)
      .order("id", { ascending: false })
      .limit(24)
      .then(({ data, error }) => {
        if (stale || error) return;
        setStatus(syncStatus((data ?? []) as SyncRun[]));
      });
    return () => { stale = true; };
  }, [key]);
  return status;
}
