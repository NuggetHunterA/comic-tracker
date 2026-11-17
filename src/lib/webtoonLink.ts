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

/** Where "In Webtoon öffnen" leads: the app's search for the issue's series. */
export function webtoonHref(issue: Issue | undefined, series: Series | undefined): string {
  if (!issue || !series) return `${WEBTOON_ORIGIN}/explore`;
  return exploreUrl(series.name);
}
