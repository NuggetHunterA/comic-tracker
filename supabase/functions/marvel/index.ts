// Finds an issue's page in the Marvel Comics app, so "In Webtoon öffnen" lands on the issue itself.
// POST {action: "issue", issue_id} → {url} (null when not found; the app then opens the Explore search).
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { apiHeaders, issuePage, pickIssue, searchHits, searchIssuesUrl } from "../_shared/marvel.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "comics" },
  auth: { persistSession: false },
});

// One device per running instance, like one browser.
const deviceId = crypto.randomUUID();

async function search(query: string) {
  const res = await fetch(searchIssuesUrl(query), { headers: apiHeaders(deviceId), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Marvel search ${res.status}`);
  return searchHits(await res.json());
}

async function issueLink(issueId: number): Promise<string | null> {
  const { data: issue, error } = await db.from("issues").select("id, number, series_id, webtoon_url").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!issue) return null;
  if (issue.webtoon_url) return issue.webtoon_url;
  const { data: s, error: se } = await db.from("series").select("name, year_began").eq("id", issue.series_id).maybeSingle();
  if (se) throw se;
  if (!s) return null;

  // "Name 1000" ranks the issue first; "Name #1000" catches the odd case it does not.
  let id: number | null = null;
  for (const q of [`${s.name} ${issue.number}`, `${s.name} #${issue.number}`]) {
    id = pickIssue(await search(q), s.name, s.year_began, issue.number);
    if (id) break;
  }
  if (!id) return null;
  const url = issuePage(id);
  await db.from("issues").update({ webtoon_url: url }).eq("id", issue.id);
  return url;
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
    // No sign-in in this single-user app: the app calls with the publishable key only.
    if (body.action === "issue") return json({ url: await issueLink(Number(body.issue_id)) });
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
