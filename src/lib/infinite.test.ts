import { describe, expect, it } from "vitest";
import { bookSlug, normalizeSeriesUrl, openHref, pickBook, pickSeries, searchUrl, slugify } from "../../supabase/functions/_shared/infinite";

// Excerpt in the shape of Infinite's series page for Batman (2011-2016).
const seriesPage = `
<a href="/comics/book/batman-2011-52/bae9d698-f6cf-43b0-98ae-7b5ce5acfd34/c">#52</a>
<a href="/comics/book/batman-2011-51/65190273-8a57-4660-a98a-5042a7afc9bf/c">#51</a>
<a href="/comics/book/batman-annual-2012-4/47699065-375c-4da9-be1d-b11b89785748/c">Annual #4</a>
<a href="/comics/book/batman-endgame-40-directors-cut-2015-1/0104b2f2-a729-4c7d-aa34-c4ab153b0c6e/c">Endgame</a>`;

describe("Infinite slugs", () => {
  it("drops apostrophes and slashes like Infinite does", () => {
    expect(slugify("Batman/Shadow")).toBe("batmanshadow");
    expect(slugify("Batman '89")).toBe("batman-89");
    expect(slugify("World's Finest Comics")).toBe("worlds-finest-comics");
  });
  it("builds the issue slug from name, start year and number", () => {
    expect(bookSlug("Batman", 2011, "52")).toBe("batman-2011-52");
    expect(bookSlug("Absolute Batman", 2024, "12")).toBe("absolute-batman-2024-12");
  });
});

describe("pickBook", () => {
  it("finds the issue on the series page", () => {
    expect(pickBook(seriesPage, "Batman", 2011, "51")).toBe("https://www.dcuniverseinfinite.com/comics/book/batman-2011-51/65190273-8a57-4660-a98a-5042a7afc9bf");
  });
  it("does not take an annual with the same number", () => {
    expect(pickBook(seriesPage, "Batman", 2011, "4")).toBeNull();
  });
  it("accepts a volume year that differs from Metron's", () => {
    expect(pickBook(seriesPage, "Batman", 2012, "52")).toContain("/batman-2011-52/");
  });
});

describe("pickSeries", () => {
  const sitemap = `
<loc>https://www.dcuniverseinfinite.com/comics/series/batman-2011-2016/e98b04b0-b3b3-4fda-b735-3c120c7c4f4a</loc>
<loc>https://www.dcuniverseinfinite.com/comics/series/batman-beyond-1999-2001/136b0b6a-0857-40c4-a8df-6518cd1a4c74</loc>
<loc>https://www.dcuniverseinfinite.com/comics/series/batmanshadow-2017-/aec8bb25-09ae-4777-ab44-98da5221f742</loc>`;
  it("matches name and start year", () => {
    expect(pickSeries(sitemap, "Batman", 2011)).toContain("/batman-2011-2016/");
    expect(pickSeries(sitemap, "Batman/Shadow", 2017)).toContain("/batmanshadow-2017-/");
  });
  it("finds nothing for another volume", () => {
    expect(pickSeries(sitemap, "Batman", 2016)).toBeNull();
  });
});

describe("links", () => {
  it("accepts pasted series links with or without scheme", () => {
    const u = "https://www.dcuniverseinfinite.com/comics/series/batman-2011-2016/e98b04b0-b3b3-4fda-b735-3c120c7c4f4a";
    expect(normalizeSeriesUrl(`${u}?utm=share`)).toBe(u);
    expect(normalizeSeriesUrl("dcuniverseinfinite.com/comics/series/batman-2011-2016/e98b04b0-b3b3-4fda-b735-3c120c7c4f4a")).toBe(u);
    expect(normalizeSeriesUrl("https://example.com/comics/series/x/e98b04b0-b3b3-4fda-b735-3c120c7c4f4a")).toBeNull();
  });
  it("searches for series and number", () => {
    expect(searchUrl("Absolute Batman", "12")).toBe("https://www.dcuniverseinfinite.com/search?q=Absolute%20Batman%20%2312&group=comics");
  });
  it("hands the link to the app on Android with the web page as fallback", () => {
    const u = "https://www.dcuniverseinfinite.com/comics/book/batman-2011-52/bae9d698-f6cf-43b0-98ae-7b5ce5acfd34";
    expect(openHref(u, false)).toBe(u);
    expect(openHref(u, true)).toBe(
      `intent://www.dcuniverseinfinite.com/comics/book/batman-2011-52/bae9d698-f6cf-43b0-98ae-7b5ce5acfd34#Intent;scheme=https;package=com.wb.goog.dcuniverse;S.browser_fallback_url=${encodeURIComponent(u)};end`,
    );
  });
});
