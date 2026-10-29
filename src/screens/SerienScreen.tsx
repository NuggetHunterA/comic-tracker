import { useEffect, useMemo, useState } from "react";
import { infinite, metron, supabase } from "../lib/supabase";
import { forgetInfiniteLinks } from "../lib/infiniteLink";
import { actions, useStore } from "../lib/store";
import { shortDate } from "../lib/dates";
import { FORMAT_LABEL, issueTitle, seriesLong } from "../lib/labels";
import type { Format, Issue, Series } from "../lib/types";
import { Cover } from "../components/Cover";
import { FormatChips } from "../components/FormatChips";
import { SeriesSearch, type FoundSeries } from "../components/SeriesSearch";
import { useRun } from "../components/useRun";

export type SerienSel = { kind: "series"; id: number } | { kind: "issue"; id: number } | { kind: "add" } | null;
export type SerienTab = "serien" | "wunsch";

interface Relaunch { old: number; series: Series; first: Issue | null }

/** Same name, later start year, not followed and not waved off. */
function useRelaunches(): Relaunch[] {
  const { data } = useStore();
  const [found, setFound] = useState<Relaunch[]>([]);
  const key = data ? data.followed.map((f) => f.series_id).join(",") + "|" + data.dismissed.join(",") : "";
  useEffect(() => {
    if (!data || !data.followed.length) return setFound([]);
    const followed = data.followed.map((f) => data.series.get(f.series_id)).filter((s): s is Series => !!s);
    const followedIds = new Set(followed.map((s) => s.id));
    let stale = false;
    (async () => {
      const { data: rows } = await supabase.from("series").select("id, name, year_began, publisher, volume, status").in("name", followed.map((s) => s.name));
      const out: Relaunch[] = [];
      for (const s of (rows ?? []) as Series[]) {
        if (followedIds.has(s.id) || data.dismissed.includes(s.id)) continue;
        const old = followed.find((f) => f.name === s.name && (s.year_began ?? 0) > (f.year_began ?? 0));
        if (!old) continue;
        const { data: first } = await supabase.from("issues").select("id, series_id, number, sort_number, store_date, cover_url, is_annual")
          .eq("series_id", s.id).order("sort_number").limit(1);
        out.push({ old: old.id, series: s, first: (first?.[0] as Issue) ?? null });
      }
      if (!stale) setFound(out);
    })();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return found;
}

export function SerienList({ tab, setTab, sel, onSelect }: {
  wide: boolean; tab: SerienTab; setTab: (t: SerienTab) => void; sel: SerienSel; onSelect: (s: SerienSel) => void;
}) {
  const { data, items } = useStore();
  const { run, busy } = useRun();
  if (!data) return null;
  const wishIssues = items.filter((i) => i.ui.status === "wishlist").sort((a, b) => (a.issue.store_date ?? "").localeCompare(b.issue.store_date ?? ""));
  const wishCount = wishIssues.length + data.wishlistSeries.length;
  const openCount = (sid: number) => items.filter((i) => i.issue.series_id === sid && (i.ui.status === "pile" || i.ui.status === "expected")).length;

  return (
    <>
      <h1 style={{ fontSize: 44 }}>Meine Serien</h1>
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={tab === "serien"} className={`seg ${tab === "serien" ? "on" : ""}`} onClick={() => setTab("serien")}>Serien · {data.followed.length}</button>
        <button type="button" role="tab" aria-selected={tab === "wunsch"} className={`seg ${tab === "wunsch" ? "on" : ""}`} onClick={() => setTab("wunsch")}>Wunschliste · {wishCount}</button>
      </div>

      {tab === "serien" ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {data.followed.length === 0 && (
              <div className="empty">
                <strong>Du folgst noch keiner Serie.</strong>
                <span className="mut">Neue Hefte gefolgter Serien landen automatisch auf dem Stapel.</span>
              </div>
            )}
            {data.followed.map((f) => {
              const s = data.series.get(f.series_id);
              const cover = items.find((i) => i.issue.series_id === f.series_id)?.issue;
              const on = sel?.kind === "series" && sel.id === f.series_id;
              const ended = s?.status && /cancel|complet|end/i.test(s.status);
              return (
                <button key={f.series_id} type="button" className={`sr ${on ? "on" : ""}`} aria-current={on ? "true" : undefined}
                  style={f.paused ? { opacity: 0.6 } : undefined} onClick={() => onSelect({ kind: "series", id: f.series_id })}>
                  {cover ? <Cover issue={cover} showNumber={false} /> : <span className="cv" style={{ width: 36, flex: "none", backgroundColor: "#2a2a2a" }} />}
                  <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: 16 }}>{seriesLong(s)}</strong>
                    <span className="d mut" style={{ fontSize: 12 }}>{f.paused ? "PAUSIERT" : `${openCount(f.series_id)} OFFEN${ended ? " · ENDET" : ""}`}</span>
                  </span>
                  <span className="tag">{FORMAT_LABEL[f.default_format]}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => onSelect({ kind: "add" })}>Serie hinzufügen</button>
        </>
      ) : (
        <section aria-label="Wunschliste" style={{ display: "flex", flexDirection: "column" }}>
          {wishCount === 0 && (
            <div className="empty">
              <strong>Die Wunschliste ist leer.</strong>
              <span className="mut">Annuals und Specials deiner Serien landen hier, dazu alles, was du im Katalog vormerkst.</span>
            </div>
          )}
          {wishIssues.map((i) => (
            <button key={i.issue.id} type="button" className={`sr ${sel?.kind === "issue" && sel.id === i.issue.id ? "on" : ""}`}
              style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }} onClick={() => onSelect({ kind: "issue", id: i.issue.id })}>
              <Cover issue={i.issue} showNumber={false} style={{ width: 48 }} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 17 }}>{issueTitle(i.issue, i.series)}</strong>
                  <span className="tag">{i.issue.is_annual ? "Annual" : "Heft"}</span>
                </span>
                {i.issue.store_date && <span className="d mut" style={{ fontSize: 13 }}>PRINT {shortDate(i.issue.store_date)}</span>}
              </span>
            </button>
          ))}
          {data.wishlistSeries.map((sid) => {
            const s = data.series.get(sid);
            return (
              <div key={sid} className="sr" style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)", cursor: "default" }}>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 17 }}>{seriesLong(s)}</strong><span className="tag">Serie</span></span>
                </span>
                <button type="button" className="btn" disabled={busy}
                  onClick={() => run(() => actions.follow(sid, (s?.publisher ?? "").startsWith("DC") ? "infinite" : "print"))}>Folgen</button>
              </div>
            );
          })}
        </section>
      )}
      <span className="d mut" style={{ fontSize: 12, marginTop: "auto", paddingTop: 16 }}>VERSION {__VERSION__}</span>
    </>
  );
}

export function SeriesDetail({ seriesId, onSelect, onGone }: { seriesId: number; onSelect: (s: SerienSel) => void; onGone: () => void }) {
  const { data, items } = useStore();
  const { run, busy, error } = useRun();
  const relaunches = useRelaunches();
  if (!data) return null;
  const s = data.series.get(seriesId);
  const f = data.followed.find((x) => x.series_id === seriesId);
  const open = items.filter((i) => i.issue.series_id === seriesId && (i.ui.status === "pile" || i.ui.status === "expected"))
    .sort((a, b) => (a.issue.sort_number ?? 0) - (b.issue.sort_number ?? 0));
  const read = items.filter((i) => i.issue.series_id === seriesId && i.ui.status === "read").length;
  const relaunch = relaunches.find((r) => r.old === seriesId);
  const isDC = (s?.publisher ?? "").startsWith("DC");

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 32, lineHeight: 1 }}>{seriesLong(s)}</h2>
        <span className="mut" style={{ fontSize: 15 }}>{read} gelesen · {open.length} auf dem Stapel</span>
      </div>
      {relaunch && (
        <div style={{ background: "var(--ink)", color: "var(--paper)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 15 }}>
            <span className="stk">NEUSTART</span>{" "}
            {relaunch.series.name} ({relaunch.series.year_began}){relaunch.first?.store_date ? ` #${relaunch.first.number} erscheint am ${shortDate(relaunch.first.store_date)}` : ""}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn hot" disabled={busy} onClick={() => run(() => actions.follow(relaunch.series.id, f?.default_format ?? "infinite"))}>Folgen</button>
            <button type="button" className="btn" style={{ background: "transparent", color: "var(--paper)", borderColor: "var(--paper)" }} disabled={busy}
              onClick={() => run(() => actions.dismissSuggestion(relaunch.series.id))}>Nicht folgen</button>
          </div>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        {open.map((i) => (
          <button key={i.issue.id} type="button" className="tile" onClick={() => onSelect({ kind: "issue", id: i.issue.id })} aria-label={issueTitle(i.issue, i.series)}>
            <Cover issue={i.issue} readable={i.readable} />
          </button>
        ))}
      </div>
      {f && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Standardformat für neue Hefte</span>
          <FormatChips value={f.default_format} allowInfinite={isDC} onChange={(fmt) => run(() => actions.setDefaultFormat(seriesId, fmt))} />
          <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.setPaused(seriesId, !f.paused))}>{f.paused ? "Fortsetzen" : "Pausieren"}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await actions.unfollow(seriesId); onGone(); })}>Nicht mehr folgen</button>
          </div>
          {isDC && <InfiniteSeriesLink seriesId={seriesId} />}
        </div>
      )}
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
    </>
  );
}

/** The series page on Infinite, pasted by hand when the lookup cannot find it. */
function InfiniteSeriesLink({ seriesId }: { seriesId: number }) {
  const { run, busy, error } = useRun();
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    let live = true;
    supabase.from("series").select("infinite_url").eq("id", seriesId).maybeSingle()
      .then(({ data }) => { if (live) setSaved((data as { infinite_url?: string | null } | null)?.infinite_url ?? null); });
    return () => { live = false; };
  }, [seriesId]);

  const save = (url: string | null) => run(async () => {
    const r = await infinite<{ url: string | null }>({ action: "set-series", series_id: seriesId, url });
    forgetInfiniteLinks();
    setSaved(r.url);
    setDraft("");
  });

  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 32 }}>Serie in Infinite{saved ? " · verknüpft" : ""}</summary>
      <form noValidate style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) save(draft); }}>
        <span className="mut" style={{ fontSize: 14 }}>
          Öffnet „In Infinite öffnen“ nur die Suche? Teile die Serie in der Infinite-App, kopiere den Link und füge ihn hier ein.
        </span>
        <label className="field">
          Link der Serie
          <input type="url" inputMode="url" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={saved ?? "dcuniverseinfinite.com/comics/series/…"} autoComplete="off" />
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" className="btn solid" disabled={busy || !draft.trim()}>Link speichern</button>
          {saved && <button type="button" className="btn" disabled={busy} onClick={() => save(null)}>Link entfernen</button>}
        </div>
        {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
      </form>
    </details>
  );
}

export function AddSeries({ onDone }: { onDone: (seriesId: number) => void }) {
  const { reload } = useStore();
  const [pick, setPick] = useState<FoundSeries | null>(null);
  const [format, setFormat] = useState<Format>("infinite");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isDC = useMemo(() => (pick?.publisher ?? "").startsWith("DC"), [pick]);

  async function follow() {
    if (!pick) return;
    setBusy(true);
    setMsg("Hole die Serie von Metron …");
    try {
      await metron({ action: "sync-series", series_id: pick.id });
      await actions.follow(pick.id, isDC ? format : "print");
      await reload();
      onDone(pick.id);
    } catch (e) {
      setMsg((e as { message?: string })?.message ?? "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 30 }}>Serie hinzufügen</h2>
      <span className="mut" style={{ fontSize: 15 }}>Ab jetzt landen neue Hefte automatisch auf dem Stapel. Ältere Hefte trägst du als Altbestand ein.</span>
      <SeriesSearch picked={pick?.id} onPick={(s) => { setPick(s); setFormat((s.publisher ?? "").startsWith("DC") ? "infinite" : "print"); }} />
      {pick && (
        <>
          {isDC && (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Wie liest du {pick.name}?</span>
              <FormatChips value={format} onChange={setFormat} />
            </>
          )}
          <button type="button" className="btn solid" disabled={busy} onClick={follow}>{busy ? "Folge …" : "Folgen"}</button>
        </>
      )}
      {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}
