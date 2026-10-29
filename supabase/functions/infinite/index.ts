// Finds an issue's page on DC Universe Infinite, so "In Infinite öffnen" lands on the issue itself.
// POST {action: "issue", issue_id} → {url} (null when not found; the app then opens a search).
// POST {action: "set-series", series_id, url} stores a pasted series link (url null clears it).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { INFINITE_ORIGIN, normalizeSeriesUrl, pickBook, pickSeries } from "../_shared/infinite.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "comics" },
  auth: { persistSession: false },
});

async function page(path: string): Promise<string> {
  const res = await fetch(new URL(path, INFINITE_ORIGIN), {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Infinite ${res.status} on ${path}`);
  return res.text();
}

const attempt = (path: string) => page(path).catch(() => "");

/** The series page: pasted or found earlier, else from Infinite's sitemap, else from its search. */
async function findSeries(name: string, yearBegan: number | null): Promise<string | null> {
  const index = await attempt("/sitemap.xml");
  const maps = [...index.matchAll(/<loc>([^<]*sitemap-comicseries[^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const map of maps) {
    const hit = pickSeries(await attempt(map), name, yearBegan);
    if (hit) return hit;
  }
  return pickSeries(await attempt(`/search?q=${encodeURIComponent(name)}&group=comics`), name, yearBegan);
}

async function issueLink(issueId: number): Promise<string | null> {
  const { data: issue, error } = await db.from("issues").select("id, number, series_id, infinite_url").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!issue) return null;
  if (issue.infinite_url) return issue.infinite_url;
  const { data: s, error: se } = await db.from("series").select("id, name, year_began, infinite_url").eq("id", issue.series_id).maybeSingle();
  if (se) throw se;
  if (!s) return null;

  let seriesUrl: string | null = s.infinite_url;
  if (!seriesUrl) {
    seriesUrl = await findSeries(s.name, s.year_began);
    if (seriesUrl) await db.from("series").update({ infinite_url: seriesUrl }).eq("id", s.id);
  }
  // The series page lists the newest issues; the issue search covers older ones.
  let url = seriesUrl ? pickBook(await attempt(seriesUrl), s.name, s.year_began, issue.number) : null;
  url ??= pickBook(await attempt(`/search?q=${encodeURIComponent(`${s.name} ${issue.number}`)}&group=comics`), s.name, s.year_began, issue.number);
  if (url) await db.from("issues").update({ infinite_url: url }).eq("id", issue.id);
  return url;
}

async function setSeries(seriesId: number, input: unknown): Promise<string | null> {
  const url = input == null || input === "" ? null : normalizeSeriesUrl(String(input));
  if (input != null && input !== "" && !url) throw new BadInput("Das ist kein Serien-Link von DC Universe Infinite.");
  const { error } = await db.from("series").update({ infinite_url: url }).eq("id", seriesId);
  if (error) throw error;
  // Issue links found under the old series page may be wrong now.
  await db.from("issues").update({ infinite_url: null }).eq("series_id", seriesId);
  return url;
}

class BadInput extends Error {}

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
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: user } = await db.auth.getUser(token);
    if (!user?.user) return json({ error: "unauthorized" }, 401);

    if (body.action === "issue") return json({ url: await issueLink(Number(body.issue_id)) });
    if (body.action === "set-series") return json({ url: await setSeries(Number(body.series_id), body.url) });
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    if (e instanceof BadInput) return json({ error: e.message }, 400);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
