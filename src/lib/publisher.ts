// The two publishers the app plans for, and what follows from them:
// DC reads on DC Universe Infinite, Marvel in the Marvel app on Webtoon.
import type { Format, Series } from "./types";

export type Verlag = "dc" | "marvel" | "other";

export function verlagOf(series: Pick<Series, "publisher"> | undefined | null): Verlag {
  const p = (series?.publisher ?? "").toLowerCase();
  if (p.startsWith("dc")) return "dc";
  if (p.startsWith("marvel")) return "marvel";
  return "other";
}

/** The subscription a publisher's issues unlock in, or null when they are bought. */
export function subFormatOf(series: Pick<Series, "publisher"> | undefined | null): Format | null {
  const v = verlagOf(series);
  return v === "dc" ? "infinite" : v === "marvel" ? "webtoon" : null;
}

/** What a new issue or series of this publisher is read as by default. */
export function defaultFormatOf(series: Pick<Series, "publisher"> | undefined | null): Format {
  return subFormatOf(series) ?? "print";
}

/** Read in a subscription: readable a fixed number of days after the store date. */
export function isSub(format: Format | null | undefined): format is "infinite" | "webtoon" {
  return format === "infinite" || format === "webtoon";
}

export const VERLAG_LABEL: Record<Verlag, string> = { dc: "DC", marvel: "Marvel", other: "Andere" };
