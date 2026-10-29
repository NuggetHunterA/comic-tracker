import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { addDays, monthLabel, monthStart, shortDate } from "../lib/dates";
import { issueTitle } from "../lib/labels";
import type { Issue, Series } from "../lib/types";
import { Cover } from "../components/Cover";
import { ConnectFlyer } from "../components/ConnectFlyer";
import { useConnect } from "../lib/connect";
import { infiniteHref } from "../lib/infiniteLink";

export type Verlag = "dc" | "other";
const PUBLISHERS: Record<Verlag, string[]> = { dc: ["DC Comics"], other: ["Marvel", "Image"] };

type Row = Issue & { series: Series };

export function KatalogList({ month, setMonth, selected, onSelect }: {
  month: string;
  setMonth: (m: string) => void;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const { data, today, remember } = useStore();
  const [verlag, setVerlag] = useState<Verlag>("dc");
  const [mine, setMine] = useState(false);
  const [firsts, setFirsts] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { connect, markRead } = useConnect(today);

  useEffect(() => {
    let stale = false;
    setRows(null);
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
        if (e) setError(e.message);
        const list = (d ?? []) as unknown as Row[];
        setRows(list);
        remember(list.map(({ series: _s, ...i }) => i), list.map((r) => r.series));
      });
    return () => { stale = true; };
  }, [month, verlag, remember]);

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
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={verlag === "dc"} className={`seg ${verlag === "dc" ? "on" : ""}`} onClick={() => setVerlag("dc")}>DC</button>
        <button type="button" role="tab" aria-selected={verlag === "other"} className={`seg ${verlag === "other" ? "on" : ""}`} onClick={() => setVerlag("other")}>Marvel + Image</button>
      </div>
      {verlag === "dc" && connect && (
        <ConnectFlyer
          latest={connect.latest}
          next={connect.next}
          href={infiniteHref(connect.latest.url)}
          onRead={() => markRead().catch((e) => setError((e as { message?: string })?.message ?? String(e)))}
        />
      )}
      <div className="chips">
        <button type="button" className={`chip ${mine ? "on" : ""}`} aria-pressed={mine} onClick={() => setMine(!mine)}>Meine Serien</button>
        <button type="button" className={`chip ${firsts ? "on" : ""}`} aria-pressed={firsts} onClick={() => setFirsts(!firsts)}>#1 &amp; Neustarts</button>
      </div>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
      {rows === null && !error && <p className="d mut">LÄDT …</p>}
      {rows !== null && shown.length === 0 && (
        <div className="empty">
          <strong>Hier ist noch nichts.</strong>
          <span className="mut">{rows.length === 0 ? "Der Katalog für diesen Monat wird nachts von Metron geholt. Schau morgen wieder rein." : "Kein Heft passt zu den Filtern."}</span>
        </div>
      )}
      <section aria-label="Neuerscheinungen" className="grid" style={{ paddingTop: 10 }}>
        {shown.map((r) => (
          <button key={r.id} type="button" className={`tile ${selected === r.id ? "sel" : ""}`} onClick={() => onSelect(r.id)}>
            <Cover issue={r} showNumber={false} tape={followed.has(r.series_id) ? "FOLGE ICH" : undefined} />
            {r.number === "1" && <span className="stk" style={{ alignSelf: "flex-end", marginTop: -30, marginRight: -6, transform: "rotate(6deg)", position: "relative", zIndex: 3 }}>#1</span>}
            <span className="t">{issueTitle(r, r.series)}</span>
            <span className="d mut" style={{ fontSize: 12 }}>{r.store_date ? shortDate(r.store_date) : ""}</span>
          </button>
        ))}
      </section>
    </>
  );
}
