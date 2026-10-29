// Metron sync for the comic tracker.
// POST {action: "cron"} with x-cron-secret: scheduled sync of followed series and the catalog.
// POST {action: "search-series", q} or {action: "sync-series", series_id} with a user JWT.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const METRON = "https://metron.cloud/api";
const MIN_GAP_MS = 3200; // Metron allows 20 requests per minute.
const RUN_BUDGET_MS = 110_000;
const CATALOG_MAX_AGE_H = 20;
const SERIES_MAX_AGE_D = 7;
const PUBLISHERS: Record<string, string> = { DC: "DC Comics", Marvel: "Marvel", Image: "Image" };

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

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: user } = await db.auth.getUser(token);
    if (!user?.user) return json({ error: "unauthorized" }, 401);
    deadline = Date.now() + RUN_BUDGET_MS;

    if (body.action === "search-series") return json({ results: await searchSeries(String(body.q ?? "")) });
    if (body.action === "sync-series") return json({ issues: await syncSeries(Number(body.series_id)) });
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof RateLimited) return json({ error: "rate_limited" }, 429);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
