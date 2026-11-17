// The Marvel Comics app by WEBTOON (marvelcomicsapp.com), shared by the app and the marvel Edge Function.
// Issue pages live at /issues/<id>. The id is the app's own number, so it is looked up through the
// search the website itself uses: GET /api/v1/explore/search/issues?query=…&offset=0&limit=20.
// That search answers only with the web client's headers, a device id among them (Adrian agreed
// to using it on 17 Nov 2026). It is unofficial: when it fails, the app opens the Explore search.

export const MARVEL_ORIGIN = "https://www.marvelcomicsapp.com";

export type SearchIssue = {
  issueId: number;
  issueNumber: string; // "#1000"
  title?: string; // "The Amazing Spider-Man (2025)"
  series?: { seriesId: number; title: string; startYear?: number | null };
};

/** The issue search for one query, at most 20 hits (the API refuses more). */
export function searchIssuesUrl(query: string): string {
  return `${MARVEL_ORIGIN}/api/v1/explore/search/issues?query=${encodeURIComponent(query)}&offset=0&limit=20`;
}

/** The headers the website sends with every API call. */
export function apiHeaders(deviceId: string): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
    "D-Comics-Client-Platform": "Web",
    "D-Comics-Device-Name": "Android 14, Chrome",
    "D-Comics-Device-Id": deviceId,
    "D-Comics-Timezone": "Europe/Berlin",
    "Accept-Language": "en",
  };
}

/** "The Amazing Spider-Man", "Amazing Spider-Man" and "the amazing spider man" compare equal. */
export function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** "#1000", "1000" and "1000.0" compare equal; "1.1" stays itself. */
export function normNumber(s: string): string {
  return s.trim().replace(/^#/, "").replace(/^0+(?=\d)/, "").replace(/\.0+$/, "").toLowerCase();
}

/**
 * The search hit for this issue: same series title and number, the volume started in the year we
 * know (Metron and Marvel sometimes differ by one), else the only volume that has that number.
 */
export function pickIssue(hits: SearchIssue[], name: string, yearBegan: number | null, number: string): number | null {
  const title = normTitle(name);
  const num = normNumber(number);
  const same = hits.filter((h) => h.series && normTitle(h.series.title) === title && normNumber(h.issueNumber) === num);
  if (same.length === 0) return null;
  if (yearBegan) {
    const exact = same.find((h) => h.series?.startYear === yearBegan);
    if (exact) return exact.issueId;
    const near = same.filter((h) => h.series?.startYear && Math.abs(h.series.startYear - yearBegan) <= 1);
    if (near.length === 1) return near[0].issueId;
  }
  const volumes = new Set(same.map((h) => h.series?.seriesId));
  return volumes.size === 1 ? same[0].issueId : null;
}

/** The hits of a search answer, [] for anything else. */
export function searchHits(body: unknown): SearchIssue[] {
  const issues = (body as { data?: { issues?: unknown } } | null)?.data?.issues;
  return Array.isArray(issues) ? (issues as SearchIssue[]).filter((i) => typeof i?.issueId === "number") : [];
}

export const issuePage = (id: number) => `${MARVEL_ORIGIN}/issues/${id}`;
