import type { Issue, Series } from "./types";

/**
 * The Marvel Comics app by WEBTOON, out on 16 Nov 2026. Its web pages live here, not on
 * marvel.webtoon.com (that domain only answers "access denied"). Every page shows the comic
 * in the browser with a "Continue in the app" button.
 */
export const WEBTOON_ORIGIN = "https://www.marvelcomicsapp.com";

/** An issue page, e.g. /issues/36882 for The Amazing Spider-Man (2025) #1000. */
export function issueUrl(id: number | string): string {
  return `${WEBTOON_ORIGIN}/issues/${id}`;
}

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

/** Where "In Webtoon öffnen" leads: the app's search for the issue's series, in the app on Android. */
export function webtoonHref(issue: Issue | undefined, series: Series | undefined, onAndroid = android): string {
  const url = issue && series ? exploreUrl(series.name) : `${WEBTOON_ORIGIN}/explore`;
  return openInApp(url, onAndroid);
}
