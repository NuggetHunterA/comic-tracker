import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Connect } from "./types";

export interface ConnectState {
  /** The newest catalog on Infinite, with Adrian's read date. */
  latest: Connect;
  /** The one after it, once dc.com dates it. */
  next?: { number: number; store_date: string | null };
  /** The day it showed up on Infinite. */
  seenOn: string | null;
}

/** DC Connect as the infinite Edge Function recorded it; null until loaded or when there is none. */
export function useConnect(today: string): { connect: ConnectState | null; markRead: () => Promise<void> } {
  const [connect, setConnect] = useState<ConnectState | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([
      supabase.from("connect_issues").select("number, infinite_url, cover_url, store_date, seen_on").order("number", { ascending: false }).limit(3),
      supabase.from("connect_reads").select("number, read_on").order("number", { ascending: false }).limit(3),
    ]).then(([issues, reads]) => {
      if (stale || issues.error || reads.error) return;
      const rows = issues.data ?? [];
      const out = rows.find((r) => r.infinite_url);
      if (!out) return;
      const next = rows.find((r) => r.number > out.number);
      setConnect({
        latest: {
          number: out.number,
          url: out.infinite_url!,
          cover_url: out.cover_url,
          store_date: out.store_date,
          read_on: reads.data?.find((r) => r.number === out.number)?.read_on ?? null,
        },
        next: next ? { number: next.number, store_date: next.store_date } : undefined,
        seenOn: out.seen_on,
      });
    });
    return () => { stale = true; };
  }, [today]);

  const markRead = useCallback(async () => {
    if (!connect) return;
    const { error } = await supabase.from("connect_reads").upsert({ number: connect.latest.number, read_on: today });
    if (error) throw error;
    setConnect({ ...connect, latest: { ...connect.latest, read_on: today } });
  }, [connect, today]);

  return { connect, markRead };
}
