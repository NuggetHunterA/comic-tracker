import { describe, expect, it } from "vitest";
import { exploreUrl, issueUrl, webtoonHref } from "./webtoonLink";
import type { Issue, Series } from "./types";

describe("Marvel Comics app links", () => {
  it("searches the series on marvelcomicsapp.com", () => {
    expect(exploreUrl("Thor")).toBe("https://www.marvelcomicsapp.com/explore?q=Thor");
    expect(exploreUrl("The Amazing Spider-Man")).toBe("https://www.marvelcomicsapp.com/explore?q=The%20Amazing%20Spider-Man");
  });

  it("builds issue pages from the app's issue id", () => {
    expect(issueUrl(36882)).toBe("https://www.marvelcomicsapp.com/issues/36882");
  });

  it("never points at the old marvel.webtoon.com", () => {
    const issue = { id: 1, number: "1000" } as Issue;
    const series = { id: 1, name: "The Amazing Spider-Man" } as Series;
    expect(webtoonHref(issue, series)).not.toContain("webtoon.com");
    expect(webtoonHref(undefined, undefined)).toBe("https://www.marvelcomicsapp.com/explore");
  });
});
