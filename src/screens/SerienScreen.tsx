import { useEffect, useMemo, useState } from "react";
import { infinite, metron, supabase } from "../lib/supabase";
import { forgetInfiniteLinks } from "../lib/infiniteLink";
import { actions, useStore, eventDone, type EventView } from "../lib/store";
import { shortDate } from "../lib/dates";
import { FORMAT_LABEL, issueTitle, seriesLong } from "../lib/labels";
import type { Issue, Series } from "../lib/types";
import { Cover } from "../components/Cover";
import { FormatChips } from "../components/FormatChips";
import { SeriesSearch, type FoundSeries } from "../components/SeriesSearch";
import { useRun } from "../components/useRun";
import { ErrorNote } from "../components/ErrorNote";
import { AllIssues, useSeriesRange } from "../components/AllIssues";
import { isFresh, markFresh } from "../lib/motion";
import { NewEvent, Ticks } from "../components/EventDetail";
import { Seal, doneOn } from "../components/EventFinale";
import { loadSeals } from "../lib/moments";
import { defaultFormatOf, isSub, subFormatOf, verlagOf, type Verlag } from "../lib/publisher";

type VerlagFilter = "alle" | Exclude<Verlag, "other">;
const FILTER_KEY = "serien-verlag";
const FILTERS: { id: VerlagFilter; label: string }[] = [{ id: "alle", label: "Alle" }, { id: "dc", label: "DC" }, { id: "marvel", label: "Marvel" }];

/** The publisher filter over Meine Serien, remembered on this device. */
function useVerlagFilter(): [VerlagFilter, (f: VerlagFilter) => void] {
  const [f, setF] = useState<VerlagFilter>(() => {
    try {
      const v = localStorage.getItem(FILTER_KEY);
      return v === "dc" || v === "marvel" ? v : "alle";
    } catch {
      return "alle";
    }
  });
  const set = (v: VerlagFilter) => {
    setF(v);
    try {
      localStorage.setItem(FILTER_KEY, v);
    } catch {
      /* private mode: forgotten next time */
    }
  };
  return [f, set];
}

export type { SerienSel, SerienTab } from "../lib/route";
import type { SerienSel, SerienTab } from "../lib/route";

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
  const { data, items, events } = useStore();
  const { run, busy } = useRun();
  const [searching, setSearching] = useState(false);
  const [verlag, setVerlag] = useVerlagFilter();
  const followedIds = useMemo(() => new Set(data?.followed.map((f) => f.series_id)), [data]);
  if (!data) return null;
  const shows = (seriesId: number) => verlag === "alle" || verlagOf(data.series.get(seriesId)) === verlag;
  // An event belongs to the publishers of its issues; an empty one shows everywhere.
  const showsEvent = (v: EventView) => verlag === "alle" || v.order.length === 0 || v.order.some((i) => shows(i.series_id));
  const followed = data.followed.filter((f) => shows(f.series_id));
  const wishIssues = items.filter((i) => i.ui.status === "wishlist" && shows(i.issue.series_id)).sort((a, b) => (a.issue.store_date ?? "").localeCompare(b.issue.store_date ?? ""));
  const wishSeries = data.wishlistSeries.filter(shows);
  const wishCount = wishIssues.length + wishSeries.length;
  const openCount = (sid: number) => items.filter((i) => i.issue.series_id === sid && i.ui.status === "pile").length;

  const shownEvents = events.filter(showsEvent);
  const readOn = (id: number) => data.userIssues.get(id)?.read_on;
  // Read to the end: newest seal first.
  const done = shownEvents.filter(eventDone).map((v) => ({ v, on: doneOn(v, readOn) }))
    .sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  const open = shownEvents.filter((v) => !eventDone(v));
  // An event sealed on this device that got new issues comes back with "+N" on its seal.
  const seals = loadSeals();
  const eventRow = (v: EventView) => {
    const on = sel?.kind === "event" && sel.id === v.event.id;
    const next = v.order.find((i) => data.userIssues.get(i.id)?.status !== "read");
    const info = v.order.length === 0 ? "NOCH LEER"
      : v.read === v.order.length ? "DURCHGELESEN"
      : `${v.read} VON ${v.order.length} GELESEN${v.read === 0 ? " · NOCH NICHT ANGEFANGEN" : ""}`;
    return (
      <button key={v.event.id} type="button" className={`evrow ${on ? "on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => onSelect({ kind: "event", id: v.event.id })}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {seals[v.event.id] !== undefined && v.order.length > seals[v.event.id] && (
            <Seal event={v.event} total={seals[v.event.id]} size="sm" plus={v.order.length - seals[v.event.id]} />
          )}
          <h3 style={{ fontSize: 24, flex: 1 }}>{v.event.name}</h3>
          <Ticks view={v} small />
        </span>
        <span className="d mut" style={{ fontSize: 12 }}>{info}{next && v.read > 0 ? ` · WEITER MIT ${issueTitle(next, data.series.get(next.series_id)).toUpperCase()}` : ""}</span>
        {v.order.length > 0 && <span className="strip">{v.order.slice(0, 9).map((i) => <Cover key={i.id} issue={i} showNumber={false} eventMark={false} readable={items.some((x) => x.issue.id === i.id && x.readable && x.ui.status !== "read")} />)}</span>}
      </button>
    );
  };

  return (
    <>
      <h1 style={{ fontSize: 44 }}>Meine Serien</h1>
      <div className="chips" role="group" aria-label="Verlag">
        {FILTERS.map((x) => (
          <button key={x.id} type="button" className={`chip ${verlag === x.id ? "on" : ""}`} aria-pressed={verlag === x.id} onClick={() => setVerlag(x.id)}>
            {x.id !== "alle" && <span className={`pubdot ${x.id}`} aria-hidden="true" />}{x.label}
          </button>
        ))}
      </div>
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={tab === "serien"} className={`seg ${tab === "serien" ? "on" : ""}`} onClick={() => setTab("serien")}>Serien · {followed.length}</button>
        <button type="button" role="tab" aria-selected={tab === "wunsch"} className={`seg ${tab === "wunsch" ? "on" : ""}`} onClick={() => setTab("wunsch")}>Wunsch · {wishCount}</button>
        <button type="button" role="tab" aria-selected={tab === "events"} className={`seg ${tab === "events" ? "on" : ""}`} onClick={() => setTab("events")}>Events · {open.length}</button>
      </div>

      {tab === "events" ? (
        <section aria-label="Events" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <NewEvent onMade={(id) => onSelect({ kind: "event", id })} />
          {events.length === 0 ? (
            <div className="empty">
              <strong>Noch keine Events.</strong>
              <span className="mut">Ein Event ist eine Lesereihenfolge über mehrere Serien, etwa ein Crossover. Der Plan liest es am Stück, und sobald du angefangen hast, kommt es jeden Abend zuerst dran.</span>
            </div>
          ) : shownEvents.length === 0 && (
            <div className="empty">
              <strong>Keine {verlag === "dc" ? "DC" : "Marvel"}-Events.</strong>
              <span className="mut">Unter „Alle“ siehst du deine anderen Events.</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {open.map(eventRow)}
          </div>
          {done.length > 0 && (
            <section aria-labelledby="ev-done">
              <h2 id="ev-done" className="ev-h">Abgeschlossen</h2>
              <div className="shelf">
                {done.map(({ v, on }) => {
                  const here = sel?.kind === "event" && sel.id === v.event.id;
                  return (
                    <button key={v.event.id} type="button" className={here ? "on" : ""} aria-current={here ? "true" : undefined}
                      onClick={() => onSelect({ kind: "event", id: v.event.id })}>
                      <Seal event={v.event} total={v.order.length} size="md" />
                      <span className="n">{v.event.name}</span>
                      {on && <span className="d mut">{shortDate(on)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </section>
      ) : tab === "serien" ? (
        <>
          <SeriesSearch followed={followedIds} onActive={setSearching}
            picked={sel?.kind === "series" ? sel.id : undefined}
            onPick={(found) => onSelect({ kind: "series", id: found.id, found })} />
          {!searching && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {data.followed.length === 0 ? (
              <div className="empty">
                <strong>Du folgst noch keiner Serie.</strong>
                <span className="mut">Such oben nach einer Serie. Neue Hefte gefolgter Serien landen automatisch auf dem Stapel.</span>
              </div>
            ) : followed.length === 0 && (
              <div className="empty">
                <strong>Du folgst keiner {verlag === "dc" ? "DC" : "Marvel"}-Serie.</strong>
                <span className="mut">Such oben nach einer Serie oder schau unter „Alle“.</span>
              </div>
            )}
            {followed.map((f) => {
              const s = data.series.get(f.series_id);
              const cover = items.find((i) => i.issue.series_id === f.series_id)?.issue;
              const on = (sel?.kind === "series" || sel?.kind === "all") && sel.id === f.series_id;
              const ended = s?.status && /cancel|complet|end/i.test(s.status);
              return (
                <button key={f.series_id} type="button" className={`sr ${on ? "on" : ""} ${f.paused ? "paused" : ""}`} aria-current={on ? "true" : undefined}
                  onClick={() => onSelect({ kind: "series", id: f.series_id })}>
                  {cover ? <Cover issue={cover} showNumber={false} /> : <span className="cv" style={{ width: 36, flex: "none", backgroundColor: "#2a2a2a" }} />}
                  <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: 16 }}>{seriesLong(s)}</strong>
                    <span className="d mut" style={{ fontSize: 12 }}>{f.paused ? "PAUSIERT" : `${openCount(f.series_id)} OFFEN${ended ? " · ENDET" : ""}`}</span>
                  </span>
                  <span className="tag">{FORMAT_LABEL[f.default_format]}</span>
                </button>
              );
            })}
          </div>}
        </>
      ) : (
        <section aria-label="Wunschliste" style={{ display: "flex", flexDirection: "column" }}>
          {wishCount === 0 && (
            <div className="empty">
              <strong>{verlag === "alle" ? "Die Wunschliste ist leer." : `Nichts von ${verlag === "dc" ? "DC" : "Marvel"} auf der Wunschliste.`}</strong>
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
          {wishSeries.map((sid) => {
            const s = data.series.get(sid);
            return (
              <div key={sid} className="sr" style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)", cursor: "default" }}>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 17 }}>{seriesLong(s)}</strong><span className="tag">Serie</span></span>
                </span>
                <button type="button" className="btn" disabled={busy}
                  onClick={() => run(() => actions.follow(sid, defaultFormatOf(s)))}>Folgen</button>
              </div>
            );
          })}
        </section>
      )}
      <span className="d mut" style={{ fontSize: 12, marginTop: "auto", paddingTop: 16 }}>VERSION {__VERSION__}</span>
    </>
  );
}

export function SeriesDetail({ seriesId, found, onSelect, onGone }: {
  seriesId: number; found?: FoundSeries; onSelect: (s: SerienSel) => void; onGone: () => void;
}) {
  const { data, items } = useStore();
  const { run, retry, busy, error } = useRun();
  const relaunches = useRelaunches();
  const range = useSeriesRange(seriesId);
  const [justFollowed] = useState(() => isFresh(`follow:${seriesId}`));
  if (!data) return null;
  const s = data.series.get(seriesId);
  const f = data.followed.find((x) => x.series_id === seriesId);
  if (!f) return <UnfollowedSeries seriesId={seriesId} found={found} onSelect={onSelect} />;
  const open = items.filter((i) => i.issue.series_id === seriesId && i.ui.status === "pile")
    .sort((a, b) => (a.issue.sort_number ?? 0) - (b.issue.sort_number ?? 0));
  const read = items.filter((i) => i.issue.series_id === seriesId && i.ui.status === "read").length;
  const relaunch = relaunches.find((r) => r.old === seriesId);
  const isDC = verlagOf(s) === "dc";
  const sub = subFormatOf(s);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 32, lineHeight: 1 }}><span className={`marker ${justFollowed ? "fresh" : ""}`}>{seriesLong(s)}</span></h2>
        <span className="mut" style={{ fontSize: 15 }}>{read} gelesen · {open.length} auf dem Stapel</span>
      </div>
      {relaunch && (
        <div style={{ background: "var(--ink)", color: "var(--paper)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 15 }}>
            <span className="stk">NEUSTART</span>{" "}
            {relaunch.series.name} ({relaunch.series.year_began}){relaunch.first?.store_date ? ` #${relaunch.first.number} erscheint am ${shortDate(relaunch.first.store_date)}` : ""}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn hot" disabled={busy} onClick={() => run(() => actions.follow(relaunch.series.id, f.default_format))}>Folgen</button>
            <button type="button" className="btn" style={{ background: "transparent", color: "var(--paper)", borderColor: "var(--paper)" }} disabled={busy}
              onClick={() => run(() => actions.dismissSuggestion(relaunch.series.id))}>Nicht folgen</button>
          </div>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
        {open.map((i) => (
          <button key={i.issue.id} type="button" className="tile" onClick={() => onSelect({ kind: "issue", id: i.issue.id, back: { kind: "series", id: seriesId } })} aria-label={issueTitle(i.issue, i.series)}>
            <Cover issue={i.issue} readable={i.readable} />
          </button>
        ))}
      </div>
      <AllIssuesButton range={range} onClick={() => onSelect({ kind: "all", id: seriesId })} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        {sub && <span style={{ fontWeight: 700, fontSize: 15 }}>Standardformat für neue Hefte</span>}
        <FormatChips value={f.default_format} sub={sub} onChange={(fmt) => run(() => actions.setDefaultFormat(seriesId, fmt))} />
        <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.setPaused(seriesId, !f.paused))}>{f.paused ? "Fortsetzen" : "Pausieren"}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await actions.unfollow(seriesId); onGone(); })}>Nicht mehr folgen</button>
        </div>
        {isDC && <InfiniteSeriesLink seriesId={seriesId} />}
      </div>
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </>
  );
}

/** The series page on Infinite, pasted by hand when the lookup cannot find it. */
function InfiniteSeriesLink({ seriesId }: { seriesId: number }) {
  const { run, retry, busy, error } = useRun();
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
        <ErrorNote error={error} onRetry={retry} busy={busy} />
      </form>
    </details>
  );
}

export function AllIssuesButton({ range, onClick }: { range: string | null; onClick: () => void }) {
  return (
    <button type="button" className="btn solid allbtn" onClick={onClick}>
      <span>Alle Hefte</span>
      {range && <span className="d">{range}</span>}
    </button>
  );
}

/** A series found by search: no pile yet, so the whole run shows right away. */
function UnfollowedSeries({ seriesId, found, onSelect }: { seriesId: number; found?: FoundSeries; onSelect: (s: SerienSel) => void }) {
  const { data } = useStore();
  const { run, retry, busy, error } = useRun();
  const s = data?.series.get(seriesId);
  const publisher = s?.publisher ?? found?.publisher ?? null;
  const fmt = defaultFormatOf({ publisher });
  const name = s ? seriesLong(s) : found ? (found.year_began && !found.name.includes(`(${found.year_began})`) ? `${found.name} (${found.year_began})` : found.name) : "Serie";
  const meta = [publisher, found?.issue_count != null ? `${found.issue_count} Hefte` : null, "Du folgst nicht"].filter(Boolean).join(" · ").toUpperCase();

  async function follow() {
    if (!data?.series.has(seriesId)) await metron({ action: "sync-series", series_id: seriesId });
    await actions.follow(seriesId, fmt);
    markFresh(`follow:${seriesId}`);
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 32, lineHeight: 1 }}>{name}</h2>
        <span className="d mut" style={{ fontSize: 13 }}>{meta}</span>
      </div>
      <button type="button" className="btn hot" disabled={busy} onClick={() => run(follow)}>{busy ? "Folge …" : "Folgen"}</button>
      <span className="mut" style={{ fontSize: 14, marginTop: -6 }}>{isSub(fmt) ? `Ab dann landen neue Hefte als ${FORMAT_LABEL[fmt]} auf dem Stapel. Das Format kannst du danach ändern.` : "Ab dann landen neue Hefte als Print auf dem Stapel."}</span>
      <ErrorNote error={error} onRetry={retry} busy={busy} />
      <AllIssues seriesId={seriesId} title={false}
        onSelect={(id) => onSelect({ kind: "issue", id, back: { kind: "series", id: seriesId, found } })} />
    </>
  );
}
