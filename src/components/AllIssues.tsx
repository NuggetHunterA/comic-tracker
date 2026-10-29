import { useEffect, useMemo, useRef, useState } from "react";
import { metron, supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { shortDate } from "../lib/dates";
import { readableFrom } from "../lib/plan";
import { issueTitle, seriesLong } from "../lib/labels";
import type { Issue, Series, UserIssue } from "../lib/types";
import { Cover } from "./Cover";

const ISSUE_COLS = "id, series_id, number, sort_number, store_date, cover_url, is_annual";
const BLOCK = 20;

type RunState = "read" | "pile" | "none";
type Filter = "alle" | RunState;

export function runState(ui: UserIssue | undefined): RunState {
  if (ui?.status === "read") return "read";
  if (ui?.status === "pile" || ui?.status === "expected") return "pile";
  return "none";
}

/**
 * Every issue of one series, newest first. Fetches the series from Metron
 * first if it was never synced, e.g. a series found by search.
 */
export function useSeriesIssues(seriesId: number) {
  const { remember } = useStore();
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setIssues(null);
    setError(null);
    (async () => {
      const readSeries = () =>
        supabase.from("series").select("id, name, year_began, publisher, volume, status, issues_synced_at").eq("id", seriesId).maybeSingle();
      let { data: s } = await readSeries();
      if (!s?.issues_synced_at) {
        setSyncing(true);
        await metron({ action: "sync-series", series_id: seriesId });
        ({ data: s } = await readSeries());
      }
      const all: Issue[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await supabase.from("issues").select(ISSUE_COLS).eq("series_id", seriesId)
          .order("sort_number", { ascending: false, nullsFirst: false }).range(from, from + 999);
        if (e) throw e;
        all.push(...((data ?? []) as Issue[]));
        if (!data || data.length < 1000) break;
      }
      if (stale) return;
      const row = s ? ({ id: s.id, name: s.name, year_began: s.year_began, publisher: s.publisher, volume: s.volume, status: s.status } as Series) : null;
      remember(all, row ? [row] : []);
      setSeries(row);
      setIssues(all);
    })()
      .catch((e) => {
        if (stale) return;
        const msg = (e as { message?: string })?.message ?? String(e);
        setError(/429|rate/i.test(msg) ? "Metron bremst gerade. Versuch es in einer Minute noch einmal." : msg);
      })
      .finally(() => !stale && setSyncing(false));
    return () => { stale = true; };
  }, [seriesId, remember]);

  return { issues, series, syncing, error };
}

/** Number range for the "Alle Hefte" button, from the issues already stored. */
export function useSeriesRange(seriesId: number): string | null {
  const [range, setRange] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    const ends = (ascending: boolean) =>
      supabase.from("issues").select("number").eq("series_id", seriesId).not("sort_number", "is", null)
        .order("sort_number", { ascending }).limit(1);
    Promise.all([ends(true), ends(false)]).then(([a, b]) => {
      if (stale) return;
      const first = a.data?.[0]?.number;
      const last = b.data?.[0]?.number;
      setRange(first && last ? (first === last ? `#${first}` : `#${first} BIS #${last}`) : null);
    });
    return () => { stale = true; };
  }, [seriesId]);
  return range;
}

export function AllIssues({ seriesId, onSelect, sel, head, title = true }: {
  seriesId: number;
  /** False where the page already names the series. */
  title?: boolean;
  onSelect: (issueId: number) => void;
  sel?: number;
  /** Shown above the title, e.g. a back button naming the series. */
  head?: React.ReactNode;
}) {
  const { data, today } = useStore();
  const { issues, series, syncing, error } = useSeriesIssues(seriesId);
  const [filter, setFilter] = useState<Filter>("alle");
  const [jump, setJump] = useState("");
  const [mark, setMark] = useState<number | null>(sel ?? null);
  const [miss, setMiss] = useState(false);

  const s = data?.series.get(seriesId) ?? series ?? undefined;
  const delay = data?.settings.infinite_delay_days ?? 30;

  const counts = useMemo(() => {
    const c = { alle: 0, read: 0, pile: 0, none: 0 };
    for (const i of issues ?? []) {
      c.alle++;
      c[runState(data?.userIssues.get(i.id))]++;
    }
    return c;
  }, [issues, data]);

  const blocks = useMemo(() => {
    const out: { key: string; label: string; list: Issue[]; read: number }[] = [];
    for (const i of issues ?? []) {
      const st = runState(data?.userIssues.get(i.id));
      if (filter !== "alle" && st !== filter) continue;
      const n = i.sort_number;
      const key = n === null ? "x" : String(Math.floor(n / BLOCK));
      let b = out[out.length - 1];
      if (!b || b.key !== key) {
        const lo = n === null ? 0 : Math.max(0, Math.floor(n / BLOCK) * BLOCK);
        b = { key, label: n === null ? "Ohne Nummer" : `#${lo}–${lo + BLOCK - 1}`, list: [], read: 0 };
        out.push(b);
      }
      b.list.push(i);
      if (st === "read") b.read++;
    }
    return out;
  }, [issues, data, filter]);

  // Scroll to a picked issue once its cell exists.
  useEffect(() => {
    if (mark === null || !issues) return;
    document.getElementById(`run-${mark}`)?.scrollIntoView({ block: "center" });
  }, [mark, issues, filter]);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const q = jump.trim().replace(/^#/, "");
    if (!q || !issues) return;
    const n = parseFloat(q);
    const hit = issues.find((i) => i.number === q) ??
      (Number.isFinite(n) ? [...issues].filter((i) => i.sort_number !== null).sort((a, b) => Math.abs(a.sort_number! - n) - Math.abs(b.sort_number! - n))[0] : undefined);
    setMiss(!hit);
    if (!hit) return;
    setFilter("alle");
    setMark(hit.id);
  }

  const chips: { id: Filter; label: string }[] = [
    { id: "alle", label: "Alle" }, { id: "read", label: "Gelesen" }, { id: "pile", label: "Stapel" }, { id: "none", label: "Fehlt" },
  ];

  return (
    <>
      {head}
      {title && (
        <div className="runtitle">
          <h2 style={{ fontSize: 32, lineHeight: 1 }}>Alle Hefte</h2>
          {!head && <span className="mut" style={{ fontSize: 15 }}>{seriesLong(s)}</span>}
        </div>
      )}
      {issues && issues.length > 0 && (
        <div className="runhead">
          <div className="chips" role="group" aria-label="Filter">
            {chips.map((c) => (
              <button key={c.id} type="button" className={`chip ${filter === c.id ? "on" : ""}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                {c.label} <span className="d cnt">{counts[c.id]}</span>
              </button>
            ))}
          </div>
          <form className="jump" onSubmit={go}>
            <label className="sr-only" htmlFor={`jump-${seriesId}`}>Springe zu Heft</label>
            <input id={`jump-${seriesId}`} type="text" inputMode="numeric" placeholder="Springe zu #" value={jump}
              onChange={(e) => { setJump(e.target.value); setMiss(false); }} autoComplete="off" />
            <button type="submit" className="btn">Los</button>
            {miss && <span role="status" className="mut" style={{ fontSize: 14, alignSelf: "center" }}>Gibt es nicht.</span>}
          </form>
        </div>
      )}

      {!issues && !error && (
        <div className="loading" role="status">
          <strong style={{ fontSize: 16 }}>{syncing ? "Hole die Hefte von Metron …" : "Lade die Hefte …"}</strong>
          <span className="bar" aria-hidden="true"><i /></span>
          {syncing && <span className="mut" style={{ fontSize: 14 }}>Beim ersten Mal dauert das bei langen Serien bis zu einer Minute. Danach öffnet die Serie sofort.</span>}
        </div>
      )}
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
      {issues && issues.length === 0 && <div className="empty"><strong>Metron kennt in dieser Serie noch keine Hefte.</strong></div>}
      {issues && issues.length > 0 && blocks.length === 0 && (
        <div className="empty"><strong>{filter === "read" ? "Aus dieser Serie hast du noch nichts gelesen." : filter === "pile" ? "Aus dieser Serie liegt nichts auf dem Stapel." : "Dir fehlt kein Heft dieser Serie."}</strong></div>
      )}

      <div className="run">
        {blocks.map((b) => (
          <Block key={b.key} label={b.label} read={b.read}>
            {(visible) => b.list.map((i) => {
              const ui = data?.userIssues.get(i.id);
              const st = runState(ui);
              const from = ui ? readableFrom(i.store_date, ui.format, ui.bought_on, delay) : null;
              const expected = st === "pile" && !(from && from <= today);
              const unlock = expected && ui?.format === "infinite" ? from : null;
              return (
                <button key={i.id} id={`run-${i.id}`} type="button" className={`cell ${st} ${mark === i.id ? "sel" : ""}`}
                  aria-label={`${issueTitle(i, s)}, ${st === "read" ? "gelesen" : st === "pile" ? "auf dem Stapel" : ui?.status === "wishlist" ? "auf der Wunschliste" : "fehlt"}`}
                  onClick={() => { setMark(i.id); onSelect(i.id); }}>
                  <Cover issue={visible ? i : { ...i, cover_url: null }} readable={!expected} tape={st === "pile" && !expected} />
                  {st === "read" && <span className="stamp">GELESEN{ui?.rating ? <b>{ui.rating}</b> : null}</span>}
                  {unlock && <span className="stk date">AB {shortDate(unlock)}</span>}
                  {ui?.status === "wishlist" && <span className="wish">WUNSCH</span>}
                </button>
              );
            })}
          </Block>
        ))}
      </div>
    </>
  );
}

/** A block of 20 issues; covers load once it scrolls near the screen. */
function Block({ label, read, children }: { label: string; read: number; children: (visible: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (!("IntersectionObserver" in window)) return setVisible(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <>
      <div ref={ref} className="band">
        <span className="d"><b>{label}</b></span>
        <span className="d mut">{read} GELESEN</span>
      </div>
      {children(visible)}
    </>
  );
}
