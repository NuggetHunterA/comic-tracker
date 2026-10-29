import { useMemo, useState } from "react";
import { useStore, type Item } from "../lib/store";
import { shortDate } from "../lib/dates";
import { issueTitle, seriesLong, seriesTitle } from "../lib/labels";
import { Cover } from "../components/Cover";
import { useSeriesRange } from "../components/AllIssues";
import { AllIssuesButton } from "./SerienScreen";

export type StapelSel =
  | { kind: "series"; id: number }
  | { kind: "all"; id: number; sel?: number }
  | { kind: "issue"; id: number; series?: number; fromAll?: boolean }
  | { kind: "import" }
  | null;
type Filter = "alle" | "print" | "infinite" | "gelesen";

const isOpen = (i: Item) => i.ui.status === "pile" || i.ui.status === "expected";

export function useStapel(filter: Filter) {
  const { items, plan } = useStore();
  return useMemo(() => {
    // Series show up in the order the plan reaches them.
    const firstPlanned = new Map<number, number>();
    let k = 0;
    for (const e of plan) for (const x of e.entries) {
      const sid = items.find((i) => i.issue.id === x.issueId)?.issue.series_id;
      if (sid !== undefined && !firstPlanned.has(sid)) firstPlanned.set(sid, k);
      k++;
    }
    const shown = items.filter((i) => {
      if (filter === "gelesen") return i.ui.status === "read";
      if (!isOpen(i)) return false;
      if (filter === "print") return i.ui.format === "print";
      if (filter === "infinite") return i.ui.format === "infinite";
      return true;
    });
    const readable = shown.filter((i) => i.readable || i.ui.status === "read");
    const expected = shown.filter((i) => !i.readable && i.ui.status !== "read")
      .sort((a, b) => (a.readableFrom ?? "9999").localeCompare(b.readableFrom ?? "9999"));
    const groups = new Map<number, Item[]>();
    for (const i of readable.sort((a, b) => (a.issue.sort_number ?? 0) - (b.issue.sort_number ?? 0))) {
      if (!groups.has(i.issue.series_id)) groups.set(i.issue.series_id, []);
      groups.get(i.issue.series_id)!.push(i);
    }
    const rank = (sid: number) => firstPlanned.get(sid) ?? Infinity;
    const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length);
    return { readable, expected, groups: ordered };
  }, [items, plan, filter]);
}

export function StapelList({ wide, sel, onSelect }: { wide: boolean; sel: StapelSel; onSelect: (s: StapelSel) => void }) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { readable, expected, groups } = useStapel(filter);
  const reading = filter === "gelesen";

  return (
    <>
      <h1 style={{ fontSize: wide ? 48 : 52 }}>Stapel</h1>
      <span className="d" style={{ fontSize: 14 }}>
        {reading ? `${readable.length} GELESEN` : `${readable.length} LESBAR · ${expected.length} ERWARTET`}
      </span>
      <div className="chips" role="group" aria-label="Filter">
        {(["alle", "print", "infinite", "gelesen"] as Filter[]).map((f) => (
          <button key={f} type="button" className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "alle" ? "Alle" : f === "print" ? "Print" : f === "infinite" ? "Infinite" : "Gelesen"}
          </button>
        ))}
      </div>

      {groups.length === 0 && expected.length === 0 && (
        <div className="empty">
          <strong style={{ fontSize: 17 }}>{reading ? "Noch nichts gelesen." : "Der Stapel ist leer."}</strong>
          {!reading && <span className="mut">Trag die Hefte ein, die schon bei dir liegen. Sie kommen als Altbestand zuerst dran.</span>}
        </div>
      )}

      {wide ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {groups.map(([sid, list]) => (
            <button key={sid} type="button" className={`sr ${(sel?.kind === "series" || sel?.kind === "all") && sel.id === sid ? "on" : ""}`}
              aria-current={(sel?.kind === "series" || sel?.kind === "all") && sel.id === sid ? "true" : undefined}
              onClick={() => onSelect({ kind: "series", id: sid })}>
              <Cover issue={list[0].issue} showNumber={false} />
              <strong style={{ flex: 1, fontSize: 17 }}>{seriesTitle(list[0].series)}</strong>
              <span className="d" style={{ fontSize: 14 }}>{list.length}</span>
            </button>
          ))}
        </div>
      ) : (
        <section aria-label="Hefte nach Serie">
          {groups.map(([sid, list]) => {
            const open = expanded.has(sid);
            const shown = open ? list : list.slice(0, 5);
            return (
              <div key={sid} className="grp">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <button type="button" className="grphead" onClick={() => onSelect({ kind: "all", id: sid })} aria-label={`Alle Hefte von ${seriesTitle(list[0].series)}`}>
                    {seriesTitle(list[0].series)}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <span className="d" style={{ fontSize: 14 }}>{list.length} {reading ? "GELESEN" : "OFFEN"}</span>
                </div>
                <div className="row">
                  {shown.map((i) => (
                    <button key={i.issue.id} type="button" onClick={() => onSelect({ kind: "issue", id: i.issue.id })}
                      aria-label={issueTitle(i.issue, i.series)} style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                      <Cover issue={i.issue} style={{ width: 52 }} />
                    </button>
                  ))}
                  {!open && list.length > 5 && (
                    <button type="button" className="more" aria-label={`Alle ${list.length} Hefte zeigen`}
                      onClick={() => setExpanded(new Set(expanded).add(sid))}>+{list.length - 5}</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {expected.length > 0 && (
        <section aria-label="Erwartet" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <h2 style={{ fontSize: 22 }}>Erwartet</h2>
          {expected.slice(0, 12).map((i) => (
            <button key={i.issue.id} type="button" onClick={() => onSelect({ kind: "issue", id: i.issue.id })}
              style={{ display: "flex", gap: 12, alignItems: "center", border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
              <Cover issue={i.issue} readable={false} showNumber={false} style={{ width: 40, flex: "none" }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: 16 }}>{issueTitle(i.issue, i.series)}</strong>
                <span className="mut" style={{ fontSize: 14 }}>{i.ui.format === "infinite" ? "Infinite" : "Print · noch nicht gekauft"}</span>
              </span>
              {i.readableFrom ? <span className="stk">AB {shortDate(i.readableFrom)}</span> : i.issue.store_date ? <span className="d mut" style={{ fontSize: 13 }}>{shortDate(i.issue.store_date)}</span> : null}
            </button>
          ))}
        </section>
      )}

      <button type="button" className="btn" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => onSelect({ kind: "import" })}>
        Altbestand eintragen
      </button>
    </>
  );
}

/** Wide detail: all issues of one series on the pile. */
export function StapelSeries({ seriesId, onSelect }: { seriesId: number; onSelect: (s: StapelSel) => void }) {
  const { data, items, plan, today } = useStore();
  const range = useSeriesRange(seriesId);
  const list = items.filter((i) => i.issue.series_id === seriesId && isOpen(i) && i.readable)
    .sort((a, b) => (a.issue.sort_number ?? 0) - (b.issue.sort_number ?? 0));
  const read = items.filter((i) => i.issue.series_id === seriesId && i.ui.status === "read").length;
  const series = data?.series.get(seriesId);
  const firstDay = plan.find((e) => e.entries.some((x) => list.some((i) => i.issue.id === x.issueId)))?.date;
  const formats = [...new Set(list.map((i) => i.ui.format))].map((f) => (f === "infinite" ? "Infinite" : "Print"));
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 34, lineHeight: 1 }}>{seriesLong(series)}</h2>
        <span className="mut" style={{ fontSize: 15 }}>
          {list.length} offen · {read} gelesen{formats.length ? ` · ${formats.join(", ")}` : ""}{list.some((i) => i.ui.old_pile) ? " · Altbestand" : ""}
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {list.map((i) => (
          <button key={i.issue.id} type="button" className="tile" onClick={() => onSelect({ kind: "issue", id: i.issue.id, series: seriesId })}
            aria-label={issueTitle(i.issue, i.series)}>
            <Cover issue={i.issue} />
          </button>
        ))}
      </div>
      <AllIssuesButton range={range} onClick={() => onSelect({ kind: "all", id: seriesId })} />
      {firstDay && <span className="mut" style={{ fontSize: 14 }}>Im Plan ab {firstDay === today ? "heute" : shortDate(firstDay)}, {data?.settings.max_per_evening} Hefte pro Abend.</span>}
    </>
  );
}
