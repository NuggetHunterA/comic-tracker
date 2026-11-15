import { describe, expect, it } from "vitest";
import { bookSlug, connectBooks, findOnSeriesPages, normalizeSeriesUrl, ogImage, onSaleDate, openHref, pickBook, pickSeries, searchUrl, slugify } from "../../supabase/functions/_shared/infinite";

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
  it("drops dots like Infinite does, e.g. DC K.O.", () => {
    expect(bookSlug("DC K.O.", 2025, "1")).toBe("dc-ko-2025-1");
    expect(slugify("Mr. Freeze")).toBe("mr-freeze");
    expect(slugify("Batman 1.5")).toBe("batman-1-5");
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

describe("findOnSeriesPages", () => {
  // A series with `total` issues, newest first; page N lists the newest N*20, pages past the end fail.
  const series = (total: number) => {
    const asked: number[] = [];
    const fetchPage = async (n: number) => {
      asked.push(n);
      if ((n - 1) * 20 >= total) return "";
      const shown = Math.min(n * 20, total);
      return Array.from({ length: shown }, (_, i) => {
        const nr = total - i;
        return `<a href="/comics/book/absolute-batman-2024-${nr}/00000000-0000-4000-8000-${String(nr).padStart(12, "0")}/c">`;
      }).join("");
    };
    return { asked, fetchPage };
  };
  it("finds an old issue on the last page, though the page after it fails", async () => {
    const s = series(27);
    expect(await findOnSeriesPages(s.fetchPage, "Absolute Batman", 2024, "1")).toContain("/absolute-batman-2024-1/");
    expect(s.asked).toEqual([1, 2]);
  });
  it("backs off to the pages between after overshooting", async () => {
    const s = series(100);
    expect(await findOnSeriesPages(s.fetchPage, "Absolute Batman", 2024, "3")).toContain("/absolute-batman-2024-3/");
    expect(s.asked).toEqual([1, 2, 4, 8, 6, 5]);
  });
  it("gives up when the whole series is shown without the issue", async () => {
    expect(await findOnSeriesPages(series(27).fetchPage, "Absolute Batman", 2024, "30")).toBeNull();
    expect(await findOnSeriesPages(series(40).fetchPage, "Absolute Batman", 2024, "41")).toBeNull();
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
  it("hands issue pages to the app on Android, searches to Chrome so the app cannot grab them", () => {
    const u = "https://www.dcuniverseinfinite.com/comics/book/batman-2011-52/bae9d698-f6cf-43b0-98ae-7b5ce5acfd34";
    expect(openHref(u, false)).toBe(u);
    expect(openHref(searchUrl("Batman", "1"), false)).toBe(searchUrl("Batman", "1"));
    const search = searchUrl("Batman", "1");
    expect(openHref(search, true)).toBe(
      `intent://www.dcuniverseinfinite.com/search?q=Batman%20%231&group=comics#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(search)};end`,
    );
    expect(openHref("https://example.com/x", true)).toBe("https://example.com/x");
    expect(openHref(u, true)).toBe(
      `intent://www.dcuniverseinfinite.com/comics/book/batman-2011-52/bae9d698-f6cf-43b0-98ae-7b5ce5acfd34#Intent;scheme=https;package=com.wb.goog.dcuniverse;S.browser_fallback_url=${encodeURIComponent(u)};end`,
    );
  });
});

describe("DC Connect", () => {
  const page = `
<a href="/comics/book/dc-connect-2021-77/340d6da1-3318-4fb7-9b03-a312d25552d4/c">#77</a>
<a href="/comics/book/dc-connect-2021-76/9973ad77-9398-4b50-879a-4948704c3415/c">#76</a>
<a href="/comics/book/dc-connect-2021-77/340d6da1-3318-4fb7-9b03-a312d25552d4">#77</a>
<a href="/comics/book/dc-connect-2020-58/2288753e-f74c-4e8f-a746-f8a0c02ffd07/c">#58</a>`;
  it("lists the catalogs newest first, whatever year the slug carries", () => {
    expect(connectBooks(page)).toEqual([
      { number: 77, url: "https://www.dcuniverseinfinite.com/comics/book/dc-connect-2021-77/340d6da1-3318-4fb7-9b03-a312d25552d4" },
      { number: 76, url: "https://www.dcuniverseinfinite.com/comics/book/dc-connect-2021-76/9973ad77-9398-4b50-879a-4948704c3415" },
      { number: 58, url: "https://www.dcuniverseinfinite.com/comics/book/dc-connect-2020-58/2288753e-f74c-4e8f-a746-f8a0c02ffd07" },
    ]);
  });
  it("reads the on-sale date from a dc.com issue page", () => {
    expect(onSaleDate(`<p>News: October 1st, 2026</p><dt>On Sale Date</dt><dd>Wednesday, November 4th, 2026</dd>`)).toBe("2026-11-04");
    expect(onSaleDate(`<p>Posted October 1st, 2026</p>`)).toBeNull();
  });
  it("takes the cover from the share image", () => {
    expect(ogImage(`<meta property="og:image" content="https://img.example/c.jpg?w=1&amp;h=2">`)).toBe("https://img.example/c.jpg?w=1&h=2");
    expect(ogImage(`<meta content="https://img.example/d.jpg" property="og:image" />`)).toBe("https://img.example/d.jpg");
  });
});
