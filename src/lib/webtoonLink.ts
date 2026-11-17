import { useEffect, useState } from "react";
import { MARVEL_ORIGIN, issuePage } from "../../supabase/functions/_shared/marvel";
import { marvel } from "./supabase";
import type { Issue, Series } from "./types";

/**
 * The Marvel Comics app by WEBTOON, out on 16 Nov 2026. Its web pages live here, not on
 * marvel.webtoon.com (that domain only answers "access denied"). Every page shows the comic
 * in the browser with a "Continue in the app" button.
 */
export const WEBTOON_ORIGIN = MARVEL_ORIGIN;

/** An issue page, e.g. /issues/36882 for The Amazing Spider-Man (2025) #1000. */
export const issueUrl = issuePage;

/**
 * The app's search ("Explore") for a series. Only the series name: the search finds series by
 * name, and the issue is one tap away on the series.
 */
export function exploreUrl(seriesName: string): string {
  return `${WEBTOON_ORIGIN}/explore?q=${encodeURIComponent(seriesName)}`;
}

/** The Marvel Comics app on Google Play. */
export const MARVEL_PACKAGE = "com.webtoon.marvelcomics";

/**
 * On Android, an intent link hands the page to the Marvel Comics app by name, so it opens in the
 * app instead of a browser tab. If the app is missing or does not take that page, Android opens
 * the web page instead.
 */
export function openInApp(url: string, android: boolean): string {
  if (!android || !url.startsWith(WEBTOON_ORIGIN)) return url;
  const rest = url.slice("https://".length);
  return `intent://${rest}#Intent;scheme=https;package=${MARVEL_PACKAGE};S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

const android = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
const found = new Map<number, string | null>();

/** Where "In Webtoon öffnen" leads without a known issue page: the app's search for the series. */
export function webtoonHref(issue: Issue | undefined, series: Series | undefined, onAndroid = android, page: string | null = null): string {
  const url = page ?? (issue && series ? exploreUrl(series.name) : `${WEBTOON_ORIGIN}/explore`);
  return openInApp(url, onAndroid);
}

/**
 * Where "In Webtoon öffnen" leads: the issue page once the marvel function found it, the
 * Explore search for the series until then (or when the lookup fails), handed to the app on Android.
 */
export function useWebtoonHref(issue: Issue | undefined, series: Series | undefined, enabled: boolean): string {
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
    marvel<{ url: string | null }>({ action: "issue", issue_id: id })
      .then((r) => {
        found.set(id, r.url);
        if (live) setUrl(r.url);
      })
      .catch(() => {
        // Not deployed or the Marvel search refused: the Explore search still works.
      });
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return webtoonHref(issue, series, android, url);
}
