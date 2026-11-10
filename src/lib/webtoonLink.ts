import type { Issue, Series } from "./types";

/** The Marvel app on Webtoon, out on 16 Nov 2026. Its issue links are not known yet. */
export const WEBTOON_ORIGIN = "https://marvel.webtoon.com";

/**
 * Where "In Webtoon öffnen" leads: the app's search for series and number. A plain https
 * link, so on Android the Marvel app takes it over once it claims its links.
 * TODO after launch: link straight to the issue page.
 */
export function webtoonHref(issue: Issue | undefined, series: Series | undefined): string {
  if (!issue || !series) return WEBTOON_ORIGIN;
  return `${WEBTOON_ORIGIN}/search?keyword=${encodeURIComponent(`${series.name} ${issue.number}`)}`;
}
