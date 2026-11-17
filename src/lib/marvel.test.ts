import { describe, expect, it } from "vitest";
import { normNumber, normTitle, pickIssue, searchHits, searchIssuesUrl, type SearchIssue } from "../../supabase/functions/_shared/marvel";

const hit = (issueId: number, issueNumber: string, title: string, startYear: number, seriesId = startYear): SearchIssue => ({
  issueId,
  issueNumber,
  series: { seriesId, title, startYear },
});

// From the live search for "The Amazing Spider-Man 1000" on 17 Nov 2026.
const spidey = [
  hit(36882, "#1000", "The Amazing Spider-Man", 2025, 4763),
  hit(35878, "#800", "The Amazing Spider-Man", 2015, 2984),
  hit(133, "#500", "The Amazing Spider-Man", 1999, 761),
  hit(17877, "#1", "The Amazing Spider-Man", 2014, 2643),
  hit(17878, "#1.1", "The Amazing Spider-Man", 2014, 2643),
  hit(34618, "#1", "The Amazing Spider-Man", 1963, 50),
];

describe("Marvel Comics app search", () => {
  it("asks for 20 hits, the most the search gives", () => {
    expect(searchIssuesUrl("Thor 5")).toBe("https://www.marvelcomicsapp.com/api/v1/explore/search/issues?query=Thor%205&offset=0&limit=20");
  });

  it("compares titles and numbers loosely", () => {
    expect(normTitle("The Amazing Spider-Man")).toBe(normTitle("Amazing Spider Man"));
    expect(normTitle("The Fantastic Four: First Foes – Dragon Man")).toBe("fantastic four first foes dragon man");
    expect(normNumber("#1000")).toBe("1000");
    expect(normNumber("1.1")).toBe("1.1");
    expect(normNumber("01")).toBe("1");
  });

  it("finds the issue of the right volume", () => {
    expect(pickIssue(spidey, "The Amazing Spider-Man", 2025, "1000")).toBe(36882);
    expect(pickIssue(spidey, "The Amazing Spider-Man", 2014, "1")).toBe(17877);
    expect(pickIssue(spidey, "The Amazing Spider-Man", 1963, "1")).toBe(34618);
    expect(pickIssue(spidey, "The Amazing Spider-Man", 2014, "1.1")).toBe(17878);
  });

  it("takes a volume a year off, or the only one with that number", () => {
    expect(pickIssue(spidey, "The Amazing Spider-Man", 2026, "1000")).toBe(36882);
    expect(pickIssue(spidey, "The Amazing Spider-Man", 1999, "1000")).toBe(36882);
    expect(pickIssue(spidey, "The Amazing Spider-Man", null, "800")).toBe(35878);
  });

  it("does not guess between volumes", () => {
    expect(pickIssue(spidey, "The Amazing Spider-Man", 1990, "1")).toBeNull();
    expect(pickIssue(spidey, "The Amazing Spider-Man", null, "1")).toBeNull();
    expect(pickIssue(spidey, "Spider-Man", 2025, "1000")).toBeNull();
    expect(pickIssue(spidey, "The Amazing Spider-Man", 2025, "999")).toBeNull();
  });

  it("reads hits only from a successful answer", () => {
    expect(searchHits({ success: true, data: { issues: [spidey[0]] } })).toEqual([spidey[0]]);
    expect(searchHits({ success: false, error: { code: "COM_0002" } })).toEqual([]);
    expect(searchHits(null)).toEqual([]);
  });
});
