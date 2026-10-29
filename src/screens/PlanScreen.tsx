import { useMemo } from "react";
import { actions, useStore } from "../lib/store";
import { dayLabel, shortDate } from "../lib/dates";
import { issueTitle, runsLabel } from "../lib/labels";
import { Cover } from "../components/Cover";
import { useRun } from "../components/useRun";

export function PlanScreen({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }) {
  const { data, plan, today, items } = useStore();
  const { run, busy, error } = useRun();

  const view = useMemo(() => {
    if (!data) return null;
    const resolve = (id: number) => ({ issue: data.issues.get(id)!, series: data.series.get(data.issues.get(id)!.series_id) });
    const tonight = plan.find((e) => e.date === today)?.entries.map((e) => resolve(e.issueId)) ?? [];
    const next = plan.filter((e) => e.date > today).slice(0, 6).map((e) => ({ date: e.date, list: e.entries.map((x) => resolve(x.issueId)) }));
    const soon = items
      .filter((i) => (i.ui.status === "pile" || i.ui.status === "expected") && i.ui.format === "infinite" && i.readableFrom && i.readableFrom > today)
      .sort((a, b) => a.readableFrom!.localeCompare(b.readableFrom!))[0];
    const pileCount = items.filter((i) => (i.ui.status === "pile" || i.ui.status === "expected") && i.readable).length;
    return { tonight, next, soon, pileCount };
  }, [data, plan, today, items]);

  if (!view) return null;
  const { tonight, next, soon, pileCount } = view;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="stk" style={{ transform: "rotate(-1deg)", fontSize: 14, padding: "3px 8px" }}>{dayLabel(today)}</span>
        <span className="d" style={{ fontSize: 14 }}>STAPEL: {pileCount}</span>
      </div>
      <h1 style={{ fontSize: "clamp(48px, 15vw, 60px)", lineHeight: 0.92 }}>Heute<br />Abend</h1>
      {tonight.length > 0 ? (
        <>
          <span style={{ fontSize: 16 }}>Am Stück: <strong>{runsLabel(tonight)}</strong></span>
          <section aria-label="Heute Abend lesen" className="tonight">
            {tonight.map(({ issue, series }) => (
              <div key={issue.id}>
                <button type="button" onClick={() => onSelect(issue.id)} aria-label={`${issueTitle(issue, series)} öffnen`}
                  style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                  <Cover issue={issue} tape big className={selected === issue.id ? "selected" : ""}
                    style={selected === issue.id ? { outline: "3px solid var(--pink)", outlineOffset: 3 } : undefined} />
                </button>
                <button type="button" className="btn" disabled={busy} aria-label={`${issueTitle(issue, series)} als gelesen markieren`}
                  onClick={() => run(() => actions.markRead(issue.id, today))}>Gelesen</button>
              </div>
            ))}
          </section>
        </>
      ) : (
        <div className="empty">
          <strong style={{ fontSize: 17 }}>Heute ist nichts lesbar.</strong>
          <span className="mut">
            {items.length === 0
              ? "Trag deinen Altbestand im Stapel ein oder folge Serien, dann füllt sich der Plan von selbst."
              : "Alles gelesen oder noch nicht verfügbar. Neue Hefte rutschen automatisch nach."}
          </span>
          {items.length === 0 && <a className="btn solid" href="#stapel" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Altbestand eintragen</a>}
        </div>
      )}
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}

      {next.length > 0 && (
        <section aria-label="Die nächsten Abende" style={{ marginTop: 8, borderTop: "3px solid var(--ink)", display: "flex", flexDirection: "column" }}>
          {next.map((e, k) => (
            <div key={e.date} className="evening">
              <span className={`d ${k === next.length - 1 ? "mut" : ""}`}>{dayLabel(e.date)}</span>
              <span className={k === next.length - 1 ? "mut" : ""} style={{ fontSize: 16 }}>{runsLabel(e.list)}</span>
            </div>
          ))}
        </section>
      )}

      {soon && (
        <button type="button" className="blackbar" onClick={() => onSelect(soon.issue.id)} style={{ border: "none", textAlign: "left", cursor: "pointer", marginTop: 4 }}>
          <Cover issue={soon.issue} readable={false} showNumber={false} />
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, color: "var(--rule)" }}>Demnächst auf Infinite</span>
            <span style={{ fontWeight: 700, fontSize: 17 }}>{issueTitle(soon.issue, soon.series)}</span>
          </span>
          <span className="stk" style={{ transform: "rotate(2deg)" }}>AB {shortDate(soon.readableFrom!)}</span>
        </button>
      )}
    </>
  );
}
