import { useEffect, useMemo, useRef, useState } from "react";
import { actions, useStore } from "../lib/store";
import { runsLabel, seriesTitle } from "../lib/labels";
import { Cover } from "./Cover";
import { useRun } from "./useRun";

/** The line in the list: series above it are read to the end in one go. */
const LINE = -1;

const GRIP = (
  <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.8" /><circle cx="9" cy="3" r="1.8" /><circle cx="3" cy="10" r="1.8" /><circle cx="9" cy="10" r="1.8" /><circle cx="3" cy="17" r="1.8" /><circle cx="9" cy="17" r="1.8" />
  </svg>
);

/**
 * The series on the pile in the order they take their turn. Drag a row or the
 * line by its grip, or focus the grip and use the arrow keys; the order is
 * saved when the row is let go.
 */
export function SeriesOrder() {
  const { data, items, plan } = useStore();
  const { run, busy, error } = useRun();

  const { saved, open, firstIssue } = useMemo(() => {
    const open = new Map<number, number>();
    const firstIssue = new Map<number, (typeof items)[number]>();
    const oldPile = new Set<number>();
    const firstDate = new Map<number, string>();
    for (const i of items) {
      if ((i.ui.status !== "pile" && i.ui.status !== "expected") || i.ui.skip_plan) continue;
      const sid = i.issue.series_id;
      open.set(sid, (open.get(sid) ?? 0) + 1);
      if (i.ui.old_pile) oldPile.add(sid);
      const d = i.issue.store_date ?? "9999";
      if (d < (firstDate.get(sid) ?? "9999")) firstDate.set(sid, d);
      const was = firstIssue.get(sid);
      if (!was || (i.issue.sort_number ?? Infinity) < (was.issue.sort_number ?? Infinity)) firstIssue.set(sid, i);
    }
    // Ranked series first, the rest as the plan takes them: old pile first, then by date.
    const ranks = data?.seriesOrder ?? [];
    const ranked = ranks.map((r) => r.series_id).filter((s) => open.has(s));
    const rest = [...open.keys()].filter((s) => !ranked.includes(s))
      .sort((a, b) => Number(oldPile.has(b)) - Number(oldPile.has(a)) || (firstDate.get(a) ?? "9999").localeCompare(firstDate.get(b) ?? "9999") || a - b);
    const whole = ranks.filter((r) => r.whole && open.has(r.series_id)).length;
    const ids = [...ranked, ...rest];
    ids.splice(whole, 0, LINE);
    return { saved: ids, open: { count: open, oldPile }, firstIssue };
  }, [data, items]);

  const key = saved.join(",");
  const [ids, setIds] = useState(saved);
  const [dragging, setDragging] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // Follow the saved order whenever it changes underneath.
  useEffect(() => setIds(key.split(",").map(Number)), [key]);

  const move = (id: number, to: number) => {
    setIds((cur) => {
      const from = cur.indexOf(id);
      if (from < 0 || to === from || to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  };
  const commit = (next: number[]) => {
    if (next.join(",") === key) return;
    run(() => actions.orderSeries(next.filter((id) => id !== LINE), next.indexOf(LINE)));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !list.current) return;
    const rows = Array.from(list.current.children) as HTMLElement[];
    const at = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    move(dragging, at < 0 ? rows.length - 1 : at);
  };

  const preview = useMemo(() => {
    if (!data) return "";
    const first = plan.flatMap((e) => e.entries).slice(0, 12).map((x) => {
      const issue = data.issues.get(x.issueId)!;
      return { issue, series: data.series.get(issue.series_id) };
    });
    return first.length ? `${runsLabel(first)} …` : "";
  }, [data, plan]);

  if (!data) return null;
  const series = ids.filter((id) => id !== LINE);

  const grip = (id: number, k: number, label: string) => (
    <button type="button" className="grip" aria-label={`${label} verschieben, Pfeiltasten hoch und runter`} disabled={busy}
      onPointerDown={(e) => { e.preventDefault(); (e.currentTarget.closest("ol") as HTMLElement).setPointerCapture(e.pointerId); setDragging(id); }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const to = k + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= ids.length) return;
        const next = [...ids];
        next.splice(k, 1);
        next.splice(to, 0, id);
        setIds(next);
        commit(next);
      }}>
      {GRIP}
    </button>
  );

  return (
    <>
      <h2 style={{ fontSize: 34, lineHeight: 1 }}>Serien ordnen</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, maxWidth: "46ch" }}>
        Über dem Strich liest du eine Serie am Stück zu Ende, darunter wechseln sich die Serien in Blöcken von 4 Heften ab. Zieh Serien oder den Strich.
      </p>
      {series.length === 0 ? (
        <p className="mut">Auf dem Stapel liegt nichts, das sich ordnen ließe.</p>
      ) : (
        <ol className="ord" ref={list} onPointerMove={onPointerMove}
          onPointerUp={() => { if (dragging !== null) { setDragging(null); commit(ids); } }}
          onPointerCancel={() => { setDragging(null); setIds(key.split(",").map(Number)); }}>
          {ids.map((id, k) => {
            if (id === LINE) {
              return (
                <li key="line" className={`line ${dragging === LINE ? "drag" : ""}`}>
                  {grip(LINE, k, "Strich")}
                  <span>AB HIER ABWECHSELND</span>
                </li>
              );
            }
            const s = data.series.get(id);
            const first = firstIssue.get(id);
            const n = open.count.get(id) ?? 0;
            return (
              <li key={id} className={dragging === id ? "drag" : ""}>
                {grip(id, k, seriesTitle(s))}
                <span className="no">{series.indexOf(id) + 1}</span>
                {first && <Cover issue={first.issue} showNumber={false} eventMark={false} />}
                <span className="t">
                  <strong>{seriesTitle(s)}</strong>
                  <span className="mut" style={{ fontSize: 14 }}>{n} offen{open.oldPile.has(id) ? " · Altbestand" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {preview && (
        <div className="rot">
          <span className="d">SO LIEST DU DANN</span>
          <span>{preview}</span>
        </div>
      )}
      <span className="locked">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        Altbestand zuerst, Nummernfolge, Events und feste Abende bleiben.
      </span>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
      {data.seriesOrder.length > 0 && (
        <button type="button" className="btn dashed" style={{ alignSelf: "flex-start" }} disabled={busy}
          onClick={() => run(() => actions.sortSeriesByDate())}>Nach Erscheinungsdatum sortieren</button>
      )}
    </>
  );
}
