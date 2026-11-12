// Metron sync for the comic tracker.
// POST {action: "cron"} with x-cron-secret: scheduled sync of followed series and the catalog.
// The cron run also keeps the Archivkiste filled (fillArchive).
// POST {action: "search-series", q}, {action: "sync-series", series_id} or {action: "issue-writer", issue_id} with a user JWT.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { CLASSICS, SEASONS, SEASON_TERMS, type Classic } from "../_shared/classics.ts";
import { writerDue } from "../_shared/writer.ts";

const METRON = "https://metron.cloud/api";
const MIN_GAP_MS = 3200; // Metron allows 20 requests per minute.
const RUN_BUDGET_MS = 110_000;
const CATALOG_MAX_AGE_H = 20;
const SERIES_MAX_AGE_D = 7;
const WRITERS_PER_RUN = 15;
// Image left the catalog; its series can still be found and followed through the search.
const PUBLISHERS: Record<string, string> = { DC: "DC Comics", Marvel: "Marvel" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "comics" },
  auth: { persistSession: false },
});

class RateLimited extends Error {}
class OutOfTime extends Error {}

let lastCall = 0;
let deadline = Infinity;

async function metron(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (Date.now() + Math.max(wait, 0) + 5000 > deadline) throw new OutOfTime();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = new URL(path.startsWith("http") ? path : `${METRON}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${Deno.env.get("METRON_API_TOKEN")}`, Accept: "application/json" },
  });
  if (res.status === 429) throw new RateLimited(res.headers.get("retry-after") ?? "");
  if (!res.ok) throw new Error(`Metron ${res.status} on ${url.pathname}`);
  return res.json();
}

async function metronAll(path: string, params: Record<string, string | number>): Promise<any[]> {
  const out: any[] = [];
  let page = await metron(path, params);
  out.push(...page.results);
  while (page.next) {
    page = await metron(page.next);
    out.push(...page.results);
  }
  return out;
}

function sortNumber(n: string | null | undefined): number | null {
  if (!n) return null;
  const s = n.replace("½", ".5").trim();
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}

const isAnnual = (seriesName: string, number: string) =>
  /\b(annual|special)\b/i.test(seriesName) || /annual/i.test(number);

async function upsertListIssues(items: any[], publisher: string | null) {
  if (!items.length) return;
  const series = new Map<number, any>();
  for (const it of items) {
    const s = it.series;
    if (!s || series.has(s.id)) continue;
    const row: any = { id: s.id, name: s.name, year_began: s.year_began, volume: s.volume, updated_at: new Date().toISOString() };
    if (publisher) row.publisher = publisher;
    series.set(s.id, row);
  }
  const { error: se } = await db.from("series").upsert([...series.values()], { onConflict: "id" });
  if (se) throw se;
  const rows = items.map((it) => ({
    id: it.id,
    series_id: it.series.id,
    number: it.number,
    sort_number: sortNumber(it.number),
    store_date: it.store_date ?? it.cover_date ?? null,
    cover_url: it.image ?? null,
    is_annual: isAnnual(it.series.name, it.number),
    metron_modified: it.modified,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("issues").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw error;
  }
}

async function getState(key: string): Promise<string | null> {
  const { data, error } = await db.from("sync_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`sync_state: ${error.message}`);
  return data?.value ?? null;
}
async function setState(key: string, value: string) {
  await db.from("sync_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function catalogMonths(now = new Date()): { key: string; from: string; to: string }[] {
  const out = [];
  for (let off = -1; off <= 2; off++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off + 1, 0));
    out.push({ key: iso(start).slice(0, 7), from: iso(start), to: iso(end) });
  }
  return out;
}

async function syncCatalog(log: string[]) {
  const stale = Date.now() - CATALOG_MAX_AGE_H * 3600_000;
  for (const m of catalogMonths()) {
    for (const [tab, name] of Object.entries(PUBLISHERS)) {
      const key = `catalog:${tab}:${m.key}`;
      const last = await getState(key);
      if (last && Date.parse(last) > stale) continue;
      const items = await metronAll("issue/", {
        publisher_name: name,
        store_date_range_after: m.from,
        store_date_range_before: m.to,
      });
      await upsertListIssues(items, name);
      await setState(key, new Date().toISOString());
      log.push(`${key}: ${items.length}`);
    }
  }
}

async function syncSeries(seriesId: number) {
  const s = await metron(`series/${seriesId}/`);
  await db.from("series").upsert({
    id: s.id,
    name: s.name,
    year_began: s.year_began,
    volume: s.volume,
    publisher: s.publisher?.name ?? null,
    status: s.status ?? null,
    updated_at: new Date().toISOString(),
  });
  const items = await metronAll("issue/", { series_id: seriesId });
  await upsertListIssues(items, s.publisher?.name ?? null);
  await db.from("series").update({ issues_synced_at: new Date().toISOString() }).eq("id", seriesId);
  return items.length;
}

async function syncFollowedSeries(log: string[]) {
  const { data: followed } = await db.from("followed_series").select("series_id").eq("paused", false);
  const ids = [...new Set((followed ?? []).map((f) => f.series_id))];
  if (!ids.length) return;
  const cutoff = new Date(Date.now() - SERIES_MAX_AGE_D * 86400_000).toISOString();
  const { data: series } = await db.from("series").select("id, issues_synced_at").in("id", ids);
  for (const s of series ?? []) {
    if (s.issues_synced_at && s.issues_synced_at > cutoff) continue;
    log.push(`series ${s.id}: ${await syncSeries(s.id)}`);
  }
}

// The first credited writer; script, story or plot only when nobody is credited as writer.
function firstWriter(credits: any[] | undefined): string | null {
  for (const role of ["Writer", "Script", "Story", "Plot"]) {
    const c = (credits ?? []).find((c) => (c.role ?? []).some((r: any) => r.name === role));
    if (c?.creator) return c.creator;
  }
  return null;
}

async function syncWriter(issueId: number): Promise<string | null> {
  const it = await metron(`issue/${issueId}/`);
  const writer = firstWriter(it.credits);
  const { error } = await db.from("issues").update({ writer, writer_synced_at: new Date().toISOString() }).eq("id", issueId);
  if (error) throw error;
  return writer;
}

// A few pile issues per run, so most details already know their writer. Metron often credits the
// writer only around release, so empty answers are asked again on release day and weekly after.
async function syncPileWriters(log: string[]) {
  const { data: open } = await db.from("user_issues").select("issue_id").eq("status", "pile");
  const ids = [...new Set((open ?? []).map((u) => u.issue_id))];
  if (!ids.length) return;
  const due: { id: number; writer_synced_at: string | null; store_date: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("issues").select("id, writer, writer_synced_at, store_date")
      .in("id", ids.slice(i, i + 150)).is("writer", null);
    if (error) throw error;
    due.push(...(data ?? []).filter((r) => writerDue(r)));
  }
  // Never asked first, then the issues closest to today.
  const today = Date.now();
  const distance = (d: string | null) => (d ? Math.abs(Date.parse(d) - today) : Infinity);
  due.sort((a, b) => Number(!!a.writer_synced_at) - Number(!!b.writer_synced_at) || distance(a.store_date) - distance(b.store_date));
  let n = 0;
  let found = 0;
  for (const r of due.slice(0, WRITERS_PER_RUN)) {
    if (await syncWriter(r.id)) found++;
    n++;
  }
  if (n) log.push(`writers: ${found} of ${n}`);
}

async function cron(): Promise<string> {
  deadline = Date.now() + RUN_BUDGET_MS;
  const log: string[] = [];
  const { data: run } = await db.from("sync_runs").insert({}).select("id").single();
  let ok = true;
  try {
    await syncFollowedSeries(log);
    await db.rpc("materialize_followed");
    await syncCatalog(log);
    await db.rpc("materialize_followed");
    await syncPileWriters(log);
    await fillArchive(log);
  } catch (e) {
    if (e instanceof OutOfTime) log.push("budget used, continuing next run");
    else if (e instanceof RateLimited) log.push(`rate limited (retry-after ${e.message})`);
    else {
      ok = false;
      log.push(`error: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    }
  }
  const message = log.join("; ");
  if (run) await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok, message }).eq("id", run.id);
  return message;
}

// ---------- Archivkiste ----------
// Keeps a few envelopes ready: runs from writers the reader rated 9 or 10
// twice, runs from the built-in list, an issue out this week 10, 20 or 30
// years ago, and in October and December a holiday special. DC runs are
// only kept when DC Universe Infinite has their first issue.

const ARCHIVE_OPEN = 6;
const WRITER_REST_D = 30;
const BACK_REST_D = 90;
const MAX_RUN = 8;
const RUN_START = 6;
const WRITER_PAGES = 3;

type ArchiveKind = "writer" | "classic" | "anniversary" | "season";
interface Draft {
  kind: ArchiveKind;
  season?: "hw" | "xm";
  items: any[];
  publisher: string;
  title: string | null;
  year: number | null;
  writer: string | null;
  reason: string;
  validFrom?: string | null;
}
interface ArchiveCtx {
  suggestions: any[];
  ownedIssues: Set<number>;
  ownedSeries: Set<number>;
  suggestedSeries: Set<number>;
}

const berlinDay = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => shiftDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
const shuffle = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const byIssueNumber = (a: any, b: any) =>
  (sortNumber(a.number) ?? 1e9) - (sortNumber(b.number) ?? 1e9) || String(a.cover_date ?? "").localeCompare(String(b.cover_date ?? ""));
const coverYear = (it: any): number | null => {
  const d = it.cover_date ?? it.store_date;
  return d ? Number(String(d).slice(0, 4)) : null;
};
const sameName = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

async function metronPages(path: string, params: Record<string, string | number>, max: number): Promise<any[]> {
  const out: any[] = [];
  let page = await metron(path, params);
  out.push(...page.results);
  for (let n = 1; page.next && n < max; n++) {
    page = await metron(page.next);
    out.push(...page.results);
  }
  return out;
}

async function archiveContext(): Promise<ArchiveCtx> {
  const [sugg, uis, fol] = await Promise.all([
    db.from("archive_suggestions").select("id, kind, season, series_id, issue_ids, status, valid_from"),
    db.from("user_issues").select("issue_id"),
    db.from("followed_series").select("series_id"),
  ]);
  for (const r of [sugg, uis, fol]) if (r.error) throw r.error;
  const ownedIssues = new Set<number>((uis.data ?? []).map((u) => u.issue_id));
  const ownedSeries = new Set<number>((fol.data ?? []).map((f) => f.series_id));
  const ids = [...ownedIssues];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("issues").select("series_id").in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const r of data ?? []) ownedSeries.add(r.series_id);
  }
  const suggestions = sugg.data ?? [];
  return { suggestions, ownedIssues, ownedSeries, suggestedSeries: new Set(suggestions.map((s) => s.series_id)) };
}

/** First issue's page on DC Universe Infinite, via the infinite function; undefined when the lookup failed. */
async function onInfinite(issueId: number): Promise<string | null | undefined> {
  if (Date.now() + 50_000 > deadline) throw new OutOfTime();
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/infinite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue", issue_id: issueId }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return undefined;
    return ((await res.json()) as { url: string | null }).url;
  } catch {
    return undefined;
  }
}

/** Puts an envelope in the box. False when it could not be checked (tried again next run). */
async function keep(ctx: ArchiveCtx, d: Draft): Promise<boolean> {
  const items = [...d.items].sort(byIssueNumber);
  await upsertListIssues(items, d.publisher);
  let status = "open";
  let verified = false;
  if (d.publisher === PUBLISHERS.DC) {
    const url = await onInfinite(items[0].id);
    if (url === undefined) return false;
    verified = !!url;
    if (!url) status = "unavailable";
  }
  const { error } = await db.from("archive_suggestions").upsert({
    kind: d.kind,
    season: d.season ?? null,
    series_id: items[0].series.id,
    issue_ids: items.map((i) => i.id),
    title: d.title,
    label_year: d.year,
    label_writer: d.writer,
    reason: d.reason,
    verified,
    status,
    valid_from: d.validFrom ?? null,
  }, { onConflict: "user_id,kind,issue_ids", ignoreDuplicates: true });
  if (error) throw error;
  ctx.suggestedSeries.add(items[0].series.id);
  return status === "open";
}

const trimRun = (items: any[]) => {
  const run = [...items].sort(byIssueNumber);
  return run.length > MAX_RUN ? run.slice(0, RUN_START) : run;
};
const timesLabel = (n: number) => (n === 2 ? "zweimal" : n === 3 ? "dreimal" : `${n}-mal`);

/** Writers with two or more issues rated 9 or 10, and those issues. */
async function ratedWriters(): Promise<Map<string, number[]>> {
  const { data: rated, error } = await db.from("user_issues").select("issue_id").gte("rating", 9);
  if (error) throw error;
  const ids = (rated ?? []).map((r) => r.issue_id);
  const out = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: e } = await db.from("issues").select("id, writer").in("id", ids.slice(i, i + 150)).not("writer", "is", null);
    if (e) throw e;
    for (const r of data ?? []) out.set(r.writer, [...(out.get(r.writer) ?? []), r.id]);
  }
  for (const [w, list] of out) if (list.length < 2) out.delete(w);
  return out;
}

/** Older runs by a writer the reader likes: series where the writer wrote, not read or followed yet. */
async function writerDrafts(ctx: ArchiveCtx, writers: Map<string, number[]>, log: string[]): Promise<Draft[]> {
  const out: Draft[] = [];
  for (const [name, issueIds] of shuffle([...writers])) {
    const key = `archive:writer:${name}`;
    const last = await getState(key);
    if (last && Date.parse(last) > Date.now() - WRITER_REST_D * 86400_000) continue;
    const it = await metron(`issue/${issueIds[0]}/`);
    const credit = (it.credits ?? []).find((c: any) => c.creator === name);
    const role = credit?.role?.find((r: any) => r.name === "Writer");
    const publisher = it.publisher?.name ?? null;
    await setState(key, new Date().toISOString());
    if (!credit?.id || !role?.id || !publisher) continue;
    const items = await metronPages("issue/", { creator_id: credit.id, role_id: role.id, publisher_name: publisher }, WRITER_PAGES);
    const bySeries = new Map<number, any[]>();
    for (const x of items) {
      if (!x.series || ctx.ownedSeries.has(x.series.id) || ctx.suggestedSeries.has(x.series.id)) continue;
      if (isAnnual(x.series.name, x.number)) continue;
      bySeries.set(x.series.id, [...(bySeries.get(x.series.id) ?? []), x]);
    }
    const runs = [...bySeries.values()].filter((l) => l.length >= 3)
      .sort((a, b) => (a[0].series.year_began ?? 9999) - (b[0].series.year_began ?? 9999));
    for (const run of runs.slice(0, 2)) {
      const r = trimRun(run);
      out.push({
        kind: "writer", items: r, publisher, title: null, year: coverYear(r[0]), writer: name,
        reason: `Weil du ${name} ${timesLabel(issueIds.length)} eine 9 oder 10 gegeben hast`,
      });
    }
    log.push(`archive writer ${name}: ${runs.length}`);
    if (out.length) break;
  }
  return out;
}

const classicKey = (c: Classic) => `archive:classic:${c.series}|${c.year}|${c.from ?? ""}`;

/** One run from the built-in list, resolved against Metron. */
async function resolveClassic(c: Classic): Promise<any[]> {
  if (c.years) {
    const items: any[] = [];
    for (const y of c.years) {
      items.push(...await metronAll("issue/", { series_name: c.series, series_year_began: c.year, publisher_name: c.publisher, cover_year: y }));
    }
    const seen = new Set<number>();
    return items.filter((x) => {
      const n = sortNumber(x.number);
      if (seen.has(x.id) || !sameName(x.series?.name, c.series) || n === null || n < c.from! || n > c.to!) return false;
      seen.add(x.id);
      return true;
    });
  }
  const items = (await metronAll("issue/", { series_name: c.series, series_year_began: c.year, publisher_name: c.publisher }))
    .filter((x) => sameName(x.series?.name, c.series) && !isAnnual(x.series.name, x.number));
  // Several volumes under one name: the one that began in that year.
  const first = items.find((x) => x.series.year_began === c.year) ?? items[0];
  return first ? items.filter((x) => x.series.id === first.series.id) : [];
}

async function classicDraft(ctx: ArchiveCtx, writers: Map<string, number[]>): Promise<Draft | null> {
  const liked = (c: Classic) => (writers.has(c.writer) ? 0 : 1);
  const todo = CLASSICS.map((c, k) => ({ c, k })).sort((a, b) => liked(a.c) - liked(b.c) || a.k - b.k).map((x) => x.c);
  for (const c of todo) {
    if (await getState(classicKey(c))) continue;
    await setState(classicKey(c), new Date().toISOString());
    const items = await resolveClassic(c);
    if (!items.length || items.some((x) => ctx.ownedIssues.has(x.id))) continue;
    if (ctx.suggestions.some((s) => s.series_id === items[0].series.id && s.issue_ids.includes(items[0].id))) continue;
    const rated = writers.get(c.writer);
    const run = [...items].sort(byIssueNumber);
    return {
      kind: "classic", items: run, publisher: c.publisher, title: c.title, year: coverYear(run[0]), writer: c.writer,
      reason: rated ? `Weil du ${c.writer} ${timesLabel(rated.length)} eine 9 oder 10 gegeben hast` : "Aus der Klassiker-Liste",
    };
  }
  return null;
}

/** An issue of a followed series line that came out this week 10, 20 or 30 years ago. */
async function anniversaryDraft(ctx: ArchiveCtx, today: string): Promise<Draft | null> {
  const monday = mondayOf(today);
  const key = `archive:anniversary:${monday}`;
  if (await getState(key)) return null;
  await setState(key, new Date().toISOString());
  const { data: fol, error } = await db.from("followed_series").select("series_id");
  if (error) throw error;
  const { data: ss, error: e2 } = await db.from("series").select("name, publisher").in("id", (fol ?? []).map((f) => f.series_id));
  if (e2) throw e2;
  const names = new Map<string, Set<string>>();
  for (const s of ss ?? []) {
    const pub = s.publisher === PUBLISHERS.Marvel ? PUBLISHERS.Marvel : PUBLISHERS.DC;
    if (!names.has(pub)) names.set(pub, new Set());
    names.get(pub)!.add(s.name.trim().toLowerCase());
  }
  for (const years of shuffle([10, 20, 30])) {
    for (const [publisher, set] of names) {
      const back = (iso: string) => `${Number(iso.slice(0, 4)) - years}${iso.slice(4)}`;
      const page = await metron("issue/", { publisher_name: publisher, store_date_range_after: back(monday), store_date_range_before: back(shiftDays(monday, 6)) });
      const hits = (page.results ?? []).filter((x: any) =>
        x.series && set.has(String(x.series.name).trim().toLowerCase()) && !ctx.ownedIssues.has(x.id) && !isAnnual(x.series.name, x.number));
      if (!hits.length) continue;
      const pick = shuffle(hits)[0];
      return {
        kind: "anniversary", items: [pick], publisher, title: null, year: coverYear(pick), writer: pick.series.name,
        reason: `Erschien diese Woche vor ${years} Jahren`, validFrom: monday,
      };
    }
  }
  return null;
}

/** In October and December: one holiday special from DC's archive. */
async function seasonDraft(ctx: ArchiveCtx, today: string): Promise<Draft | null> {
  const md = today.slice(5);
  const year = today.slice(0, 4);
  for (const season of ["hw", "xm"] as const) {
    const s = SEASONS[season];
    if (md < s.build || md > s.to) continue;
    const validFrom = `${year}-${s.from}`;
    if (ctx.suggestions.some((x) => x.kind === "season" && x.season === season && x.valid_from === validFrom && x.status !== "unavailable")) continue;
    const key = `archive:season:${season}:${today}`;
    if (await getState(key)) continue;
    await setState(key, new Date().toISOString());
    const seasonal = new Set(ctx.suggestions.filter((x) => x.kind === "season").map((x) => x.series_id));
    for (const term of SEASON_TERMS[season]) {
      const res = await metron("series/", { name: term, publisher_name: PUBLISHERS.DC });
      const cands = shuffle((res.results ?? []).filter((r: any) => !seasonal.has(r.id) && !ctx.ownedSeries.has(r.id)));
      for (const cand of cands.slice(0, 2)) {
        const items = (await metronAll("issue/", { series_id: cand.id })).sort(byIssueNumber);
        if (!items.length) continue;
        return {
          kind: "season", season, items: [items[0]], publisher: PUBLISHERS.DC, title: null, year: coverYear(items[0]), writer: null,
          reason: season === "hw" ? "Ein Special für Halloween" : "Ein Special für Weihnachten", validFrom,
        };
      }
    }
  }
  return null;
}

async function fillArchive(log: string[]) {
  const today = berlinDay();
  // Put back long enough ago: back in the box.
  await db.from("archive_suggestions").update({ status: "open", decided_at: null })
    .eq("status", "back").lt("decided_at", new Date(Date.now() - BACK_REST_D * 86400_000).toISOString());
  const ctx = await archiveContext();
  let added = 0;

  const season = await seasonDraft(ctx, today);
  if (season && await keep(ctx, season)) added++;
  const anniversary = await anniversaryDraft(ctx, today);
  if (anniversary && await keep(ctx, anniversary)) added++;

  let open = ctx.suggestions.filter((s) => s.status === "open" && (s.kind === "writer" || s.kind === "classic")).length;
  if (open < ARCHIVE_OPEN) {
    const writers = await ratedWriters();
    for (const d of await writerDrafts(ctx, writers, log)) {
      if (open >= ARCHIVE_OPEN) break;
      if (await keep(ctx, d)) { open++; added++; }
    }
    for (let tries = 0; open < ARCHIVE_OPEN && tries < 3; tries++) {
      const d = await classicDraft(ctx, writers);
      if (!d) break;
      if (await keep(ctx, d)) { open++; added++; }
    }
  }
  log.push(`archive: ${added} new, ${open} open`);
}

async function searchSeries(q: string) {
  const res = await metron("series/", { name: q });
  return (res.results ?? []).slice(0, 25).map((s: any) => ({
    id: s.id,
    name: s.series,
    year_began: s.year_began,
    issue_count: s.issue_count,
    publisher: s.publisher?.name ?? null,
    series_type: s.series_type?.name ?? null,
  }));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body
  }
  try {
    if (body.action === "cron") {
      // The scheduler's shared secret lives in comics.sync_state, readable by the service role only.
      const secret = await getState("cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) {
        return json({ error: "forbidden" }, 403);
      }
      return json({ message: await cron() });
    }

    // No sign-in in this single-user app: the app calls with the publishable key only.
    deadline = Date.now() + RUN_BUDGET_MS;

    if (body.action === "search-series") return json({ results: await searchSeries(String(body.q ?? "")) });
    if (body.action === "issue-writer") return json({ writer: await syncWriter(Number(body.issue_id)) });
    if (body.action === "sync-series") return json({ issues: await syncSeries(Number(body.series_id)) });
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof RateLimited) return json({ error: "rate_limited" }, 429);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
