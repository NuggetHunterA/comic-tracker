// DC Universe Infinite links, shared by the app and the infinite Edge Function.
// Issue pages live at /comics/book/<slug>/<uuid>, series pages at /comics/series/<slug>/<uuid>.
// The Android app is registered for the whole domain, so these URLs open it directly.

export const INFINITE_ORIGIN = "https://www.dcuniverseinfinite.com";
export const INFINITE_PACKAGE = "com.wb.goog.dcuniverse";

/** Infinite's slugs drop apostrophes and slashes and turn every other gap into a hyphen. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/½/g, "12")
    .replace(/['’/]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Batman", 2011, "52" → "batman-2011-52", the slug Infinite gives that issue. */
export function bookSlug(name: string, yearBegan: number | null, number: string): string {
  return slugify(yearBegan ? `${name} ${yearBegan} ${number}` : `${name} ${number}`);
}

const BOOK = /\/comics\/book\/([a-z0-9-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
const SERIES = /\/comics\/series\/([a-z0-9-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

function links(html: string, re: RegExp): { slug: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const m of html.matchAll(re)) {
    const url = `${INFINITE_ORIGIN}${m[0]}`;
    if (!seen.has(url)) seen.set(url, m[1]);
  }
  return [...seen].map(([url, slug]) => ({ slug, url }));
}

/** Finds the issue among the book links of a series page or search result. */
export function pickBook(html: string, name: string, yearBegan: number | null, number: string): string | null {
  const books = links(html, BOOK);
  const exact = bookSlug(name, yearBegan, number);
  const hit = books.find((b) => b.slug === exact);
  if (hit) return hit.url;
  // Same series name and number, but Infinite dates the volume differently (e.g. a year off).
  const loose = new RegExp(`^${slugify(name)}-\\d{4}-${slugify(number)}$`);
  return books.find((b) => loose.test(b.slug))?.url ?? null;
}

/** Finds the series page among series links, e.g. "batman-2011-2016" or "batmanshadow-2017-". */
export function pickSeries(html: string, name: string, yearBegan: number | null): string | null {
  const all = links(html, SERIES);
  const base = slugify(name);
  if (yearBegan) {
    const dated = all.find((s) => s.slug === `${base}-${yearBegan}` || s.slug.startsWith(`${base}-${yearBegan}-`));
    if (dated) return dated.url;
  }
  return all.find((s) => s.slug === base)?.url ?? null;
}

/** A pasted series link reduced to its canonical form, or null if it is no Infinite series link. */
export function normalizeSeriesUrl(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?dcuniverseinfinite\.com(\/comics\/series\/[a-z0-9-]+\/[0-9a-f-]{36})(?:[/?#].*)?$/i);
  return m ? `${INFINITE_ORIGIN}${m[1].toLowerCase()}` : null;
}

/** Infinite's search for one issue, the fallback when no issue page is known. */
export function searchUrl(name: string, number: string): string {
  return `${INFINITE_ORIGIN}/search?q=${encodeURIComponent(`${name} #${number}`)}&group=comics`;
}

/**
 * On Android, an intent link hands the URL straight to the Infinite app instead of letting
 * the browser decide; without the app (or a matching screen in it) it opens the web page.
 */
export function openHref(url: string, android: boolean): string {
  if (!android || !url.startsWith(INFINITE_ORIGIN)) return url;
  const rest = url.slice("https://".length);
  return `intent://${rest}#Intent;scheme=https;package=${INFINITE_PACKAGE};S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
