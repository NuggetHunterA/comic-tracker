import { useEffect, useState } from "react";
import { INFINITE_ORIGIN, openHref, searchUrl } from "../../supabase/functions/_shared/infinite";
import { infinite } from "./supabase";
import type { Issue, Series } from "./types";

const android = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
const found = new Map<number, string | null>();

/** Forgets looked-up issue pages, e.g. after the series link changed. */
export function forgetInfiniteLinks() {
  found.clear();
}

/**
 * Where "In Infinite öffnen" leads: the issue page once it is found, Infinite's search for
 * the issue until then (or when the lookup fails), handed to the app on Android.
 */
export function useInfiniteHref(issue: Issue | undefined, series: Series | undefined, enabled: boolean): string {
  const id = issue?.id;
  const [url, setUrl] = useState<string | null>(id !== undefined ? found.get(id) ?? null : null);
  useEffect(() => {
    if (!enabled || id === undefined) return;
    if (found.has(id)) {
      setUrl(found.get(id) ?? null);
      return;
    }
    let live = true;
    setUrl(null);
    infinite<{ url: string | null }>({ action: "issue", issue_id: id })
      .then((r) => {
        found.set(id, r.url);
        if (live) setUrl(r.url);
      })
      .catch(() => {
        // Not deployed or Infinite unreachable: the search still works.
      });
    return () => {
      live = false;
    };
  }, [id, enabled]);
  const target = url ?? (issue && series ? searchUrl(series.name, issue.number) : INFINITE_ORIGIN);
  return openHref(target, android);
}
