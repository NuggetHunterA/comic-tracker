// Ansage: Adrian says what he wants to read next; Claude picks the issues from his pile.
// POST {text, pile: string[], today, maxPerEvening} → {reply, issueIds}
// pile: one line per open issue in reading order, "id | Serie #Nr | Verlag | Format | lesbar … | …".
// Needs the secret ANTHROPIC_API_KEY. At most DAILY_CAP calls a day (the app has no sign-in).
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const MODEL = "claude-sonnet-5-5";
const DAILY_CAP = 40;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "comics" },
  auth: { persistSession: false },
});
const claude = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const SYSTEM = `Du hilfst Adrian, seinen Comic-Stapel spontan zu ordnen. Er sagt dir auf Deutsch, was er als Nächstes lesen will. Du suchst die passenden Hefte aus seinem Stapel heraus; die App legt sie in deiner Reihenfolge ganz nach oben.

Der Stapel kommt als Liste, eine Zeile pro Heft: "id | Serie (Jahr) #Nummer | Verlag (dc/marvel) | Format | lesbar / lesbar ab Datum / noch nicht lesbar | Event | von Hand | Platz". Die Liste ist die aktuelle Lesereihenfolge.

Regeln:
- Wähle nur ids aus dieser Liste. Erfinde nichts.
- Nur lesbare Hefte kommen nach oben. Passende, die noch nicht lesbar sind, erwähnst du in der Antwort mit dem Datum, nimmst sie aber nicht.
- Hefte einer Serie immer in Nummernfolge, ohne Lücke: fehlt ein früheres Heft der Serie oder ist es nicht lesbar, nimm die späteren nicht.
- Geht der Wunsch um heute ("heute", "heute Abend", "jetzt"), nimm höchstens so viele Hefte, wie an einem Abend gelesen werden (steht in der Anfrage). Sonst nimm alle passenden lesbaren Hefte.
- Bei einem Verlag ("Marvel", "DC") nimmst du Hefte dieses Verlags in der bisherigen Reihenfolge des Stapels.
- Gehört ein Heft zu einem Event, halte die Event-Reihenfolge ein.
- Passt nichts oder verstehst du den Wunsch nicht, gib keine ids zurück und sag kurz, warum.

Antwort: ein bis zwei kurze Sätze auf Deutsch, per du, ohne Floskeln. Sag, was oben liegt und wann es drankommt. Nenne Serien beim Namen, Nummern mit #.`;

const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Ein bis zwei kurze Sätze für Adrian." },
    issueIds: { type: "array", items: { type: "integer" }, description: "Die Hefte, die nach oben kommen, in Lesereihenfolge." },
  },
  required: ["reply", "issueIds"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  let body: { text?: unknown; pile?: unknown; today?: unknown; maxPerEvening?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Die Anfrage war leer." }, 400);
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 300) : "";
  const pile = Array.isArray(body.pile) ? body.pile.filter((l): l is string => typeof l === "string").slice(0, 800).map((l) => l.slice(0, 200)) : [];
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const perEvening = typeof body.maxPerEvening === "number" && body.maxPerEvening > 0 && body.maxPerEvening < 20 ? Math.round(body.maxPerEvening) : 3;
  if (!text) return json({ error: "Ich habe keinen Wunsch gehört. Versuch es nochmal." }, 400);
  if (!pile.length) return json({ reply: "Dein Stapel ist leer, da gibt es nichts zu ordnen.", issueIds: [] });

  const { data: calls, error: countError } = await db.rpc("ansage_count");
  if (countError) throw countError;
  if ((calls as number) > DAILY_CAP) {
    return json({ error: `Für heute sind die ${DAILY_CAP} Ansagen aufgebraucht. Morgen geht es wieder.` }, 429);
  }

  const known = new Set(pile.map((l) => Number(l.split("|")[0])));
  const res = await claude.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: `Heute ist ${today}. Pro Abend werden ${perEvening} Hefte gelesen.\n\nStapel:\n${pile.join("\n")}\n\nAdrians Wunsch: "${text}"`,
    }],
  });

  if (res.stop_reason === "refusal") return json({ reply: "Dazu kann ich nichts sagen. Versuch es anders.", issueIds: [] });
  const out = res.content.find((b) => b.type === "text");
  if (!out || out.type !== "text") throw new Error(`Keine Antwort (${res.stop_reason}).`);
  const parsed = JSON.parse(out.text) as { reply: string; issueIds: number[] };
  const issueIds = [...new Set(parsed.issueIds)].filter((id) => known.has(id));
  return json({ reply: parsed.reply, issueIds });
});
