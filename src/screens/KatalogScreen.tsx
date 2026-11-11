import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { addDays, dayLabel, monthLabel, monthStart, shortDate, weekStart } from "../lib/dates";
import { issueTitle } from "../lib/labels";
import type { Issue, Series } from "../lib/types";
import { Cover } from "../components/Cover";
import { ConnectFlyer } from "../components/ConnectFlyer";
import { useConnect } from "../lib/connect";
import { infiniteHref } from "../lib/infiniteLink";
import { ErrorNote } from "../components/ErrorNote";
import { report } from "../lib/errors";
import { useSyncStatus } from "../lib/syncStatus";
import { isNetworkError, stampLabel } from "../lib/offline";

type Tab = "dc" | "marvel";
const PUBLISHERS: Record<Tab, string[]> = { dc: ["DC Comics"], marvel: ["Marvel"] };

type Row = Issue & { series: Series };

export function KatalogList({ month, setMonth, selected, onSelect }: {
  month: string;
  setMonth: (m: string) => void;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const { data, today, remember, offline } = useStore();
  const [verlag, setVerlag] = useState<Tab>("dc");
  const [mine, setMine] = useState(false);
  const [firsts, setFirsts] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<{ text: string; retry: () => void } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { connect, markRead } = useConnect(today);
  const [noNet, setNoNet] = useState(false);
  const sync = useSyncStatus(`${today}|${month}|${offline ? "off" : "on"}`);

  useEffect(() => {
    let stale = false;
    setRows(null);
    setError(null);
    setNoNet(false);
    const end = addDays(monthStart(month, 1), -1);
    supabase
      .from("issues")
      .select("id, series_id, number, sort_number, store_date, cover_url, is_annual, series!inner(id, name, year_began, publisher, volume, status)")
      .gte("store_date", month)
      .lte("store_date", end)
      .in("series.publisher", PUBLISHERS[verlag])
      .order("store_date")
      .limit(1000)
      .then(({ data: d, error: e }) => {
        if (stale) return;
        if (e && isNetworkError(e)) return setNoNet(true);
        if (e) setError({ text: report(e), retry: () => setAttempt((n) => n + 1) });
        const list = (d ?? []) as unknown as Row[];
        setRows(list);
        remember(list.map(({ series: _s, ...i }) => i), list.map((r) => r.series));
      });
    return () => { stale = true; };
  }, [month, verlag, remember, offline, attempt]);

  const followed = useMemo(() => new Set(data?.followed.map((f) => f.series_id)), [data]);
  const shown = useMemo(() => {
    let list = rows ?? [];
    if (mine) list = list.filter((r) => followed.has(r.series_id) || data?.userIssues.has(r.id));
    if (firsts) list = list.filter((r) => r.number === "1");
    return [...list].sort((a, b) =>
      (a.store_date ?? "").localeCompare(b.store_date ?? "") ||
      Number(followed.has(b.series_id)) - Number(followed.has(a.series_id)) ||
      a.series.name.localeCompare(b.series.name),
    );
  }, [rows, mine, firsts, followed, data]);

  // Release weeks in date order, each opened by a thin rule.
  const weeks = useMemo(() => {
    const out: { key: string; rows: Row[] }[] = [];
    for (const r of shown) {
      const key = r.store_date ? weekStart(r.store_date) : "";
      if (out[out.length - 1]?.key !== key) out.push({ key, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [shown]);

  const minMonth = monthStart(today, -1);
  const maxMonth = monthStart(today, 2);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h1 style={{ fontSize: 44 }}>Katalog</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" className="iconbtn" aria-label="Voriger Monat" disabled={month <= minMonth} onClick={() => setMonth(monthStart(month, -1))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span className="d" style={{ fontSize: 15, fontWeight: 700 }}>{monthLabel(month, true)}</span>
          <button type="button" className="iconbtn" aria-label="Nächster Monat" disabled={month >= maxMonth} onClick={() => setMonth(monthStart(month, 1))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      {!offline && sync && !sync.stuck && sync.lastOk && (
        <div className="syncline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1" /><path d="M18.5 3v4.5H14M5.5 21v-4.5H10" />
          </svg>
          <span>METRON · ABGEGLICHEN {stampLabel(sync.lastOk)}</span>
        </div>
      )}
      {!offline && sync?.stuck && (
        <div className="syncwarn" role="status">
          <span className="stk">{sync.lastOk ? `METRON HÄNGT SEIT ${stampLabel(sync.lastOk)}` : "METRON HÄNGT"}</span>
          <span className="mut">Neue Hefte und Termine können fehlen. Der Abgleich versucht es jede Stunde wieder.</span>
        </div>
      )}
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={verlag === "dc"} className={`seg ${verlag === "dc" ? "on" : ""}`} onClick={() => setVerlag("dc")}>DC</button>
        <button type="button" role="tab" aria-selected={verlag === "marvel"} className={`seg ${verlag === "marvel" ? "on" : ""}`} onClick={() => setVerlag("marvel")}>Marvel</button>
      </div>
      {verlag === "dc" && connect && (
        <ConnectFlyer
          latest={connect.latest}
          next={connect.next}
          href={infiniteHref(connect.latest.url)}
          onRead={function read() {
            setError(null);
            markRead().catch((e) => setError({ text: report(e), retry: read }));
          }}
        />
      )}
      {!noNet && <div className="chips">
        <button type="button" className={`chip ${mine ? "on" : ""}`} aria-pressed={mine} onClick={() => setMine(!mine)}>Meine Serien</button>
        <button type="button" className={`chip ${firsts ? "on" : ""}`} aria-pressed={firsts} onClick={() => setFirsts(!firsts)}>#1 &amp; Neustarts</button>
      </div>}
      <ErrorNote error={error?.text ?? null} onRetry={error?.retry} />
      {noNet && (
        <div className="empty">
          <strong style={{ fontSize: 17 }}>Der Katalog braucht Netz.</strong>
          <span className="mut">Plan und Stapel laufen weiter. „Gelesen“ und Bewertungen merkt sich die App und speichert sie später.</span>
          <a className="btn solid" href="#plan" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", padding: "0 16px" }}>Zum Plan</a>
        </div>
      )}
      {rows === null && !error && !noNet && <p className="d mut">LÄDT …</p>}
      {rows !== null && !error && shown.length === 0 && (
        <div className="empty">
          <strong>Hier ist noch nichts.</strong>
          <span className="mut">{rows.length === 0 ? "Der Katalog für diesen Monat wird nachts von Metron geholt. Schau morgen wieder rein." : "Kein Heft passt zu den Filtern."}</span>
        </div>
      )}
      <section aria-label="Neuerscheinungen" className="grid" style={{ paddingTop: 10 }}>
        {weeks.map((w) => (
          <Fragment key={w.key}>
            <div className="week d">
              <span>{w.rows[0].store_date ? dayLabel(w.rows[0].store_date) : "OHNE DATUM"}</span>
              <span className="mut">{w.rows.length} {w.rows.length === 1 ? "HEFT" : "HEFTE"}</span>
            </div>
            {w.rows.map((r) => (
              <button key={r.id} type="button" className={`tile ${selected === r.id ? "sel" : ""}`} onClick={() => onSelect(r.id)}>
                <Cover issue={r} showNumber={false} publisherMark={false} tape={followed.has(r.series_id) ? "FOLGE ICH" : undefined} />
                {r.number === "1" && <span className="stk" style={{ alignSelf: "flex-end", marginTop: -30, marginRight: -6, transform: "rotate(6deg)", position: "relative", zIndex: 3 }}>#1</span>}
                <span className="t">{issueTitle(r, r.series)}</span>
                <span className="d mut" style={{ fontSize: 12 }}>{r.store_date ? shortDate(r.store_date) : ""}</span>
              </button>
            ))}
          </Fragment>
        ))}
      </section>
    </>
  );
}
