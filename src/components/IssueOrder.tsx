import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { dayLabel, shortDate } from "../lib/dates";
import { issueTitle } from "../lib/labels";
import { Cover } from "./Cover";
import { HandIcon } from "./HandIcon";
import { useRun } from "./useRun";
import { ErrorNote } from "./ErrorNote";

const GRIP = (
  <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.8" /><circle cx="9" cy="3" r="1.8" /><circle cx="3" cy="10" r="1.8" /><circle cx="9" cy="10" r="1.8" /><circle cx="3" cy="17" r="1.8" /><circle cx="9" cy="17" r="1.8" />
  </svg>
);

/**
 * The reading list, issue by issue, the way the plan reads it. Drag a row by
 * its grip, or focus the grip and use the arrow keys; a moved issue keeps its
 * place, also when the list is sorted again.
 */
export function IssueOrder() {
  const { data, items, plan, list, today, resort, moveTo, release } = useStore();
  const { run, retry, busy, error } = useRun();

  const saved = list.map((e) => e.issueId);
  const key = saved.join(",");
  const [ids, setIds] = useState(saved);
  const [dragging, setDragging] = useState<number | null>(null);
  const ol = useRef<HTMLOListElement>(null);
  useEffect(() => setIds(key ? key.split(",").map(Number) : []), [key]);

  const { byId, when, entry } = useMemo(() => {
    const byId = new Map(items.map((i) => [i.issue.id, i]));
    const when = new Map<number, string>();
    for (const e of plan) for (const x of e.entries) when.set(x.issueId, e.date === today ? "HEUTE" : dayLabel(e.date));
    return { byId, when, entry: new Map(list.map((e) => [e.issueId, e])) };
  }, [items, plan, list, today]);

  if (!data) return null;
  const added = list.filter((e) => e.added).length;
  const manual = list.filter((e) => e.manual).length;
  const label = (id: number) => {
    const w = when.get(id);
    if (w) return w;
    const from = byId.get(id)?.readableFrom;
    return from ? `AB ${shortDate(from)}` : "OHNE TERMIN";
  };

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
  const commit = (id: number, next: number[]) => {
    if (next.join(",") === key) return;
    run(() => moveTo(id, next.indexOf(id)));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !ol.current) return;
    const rows = Array.from(ol.current.children) as HTMLElement[];
    const at = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    move(dragging, at < 0 ? rows.length - 1 : at);
  };

  return (
    <>
      <h2 style={{ fontSize: 34, lineHeight: 1 }}>Hefte ordnen</h2>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, maxWidth: "46ch" }}>
        Der Plan liest diese Liste von oben nach unten, {data.settings.max_per_evening} Hefte pro Abend. Lesen ändert die Reihenfolge nicht. Zieh ein Heft an seinen Platz, dort bleibt es auch beim Neusortieren.
      </p>
      <div className="resort">
        <span>
          {added === 0 ? "Seit dem letzten Sortieren ist nichts dazugekommen." : <><strong>{added === 1 ? "1 neues Heft" : `${added} neue Hefte`}</strong> seit dem letzten Sortieren, je hinter ihrer Serie einsortiert.</>}
        </span>
        <button type="button" className={`btn ${added > 0 ? "solid" : ""}`} disabled={busy || list.length === 0}
          onClick={() => run(() => resort())}>Neu sortieren</button>
      </div>
      {manual > 0 && (
        <div className="resort">
          <span>
            <strong>{manual === 1 ? "1 Heft" : `${manual} Hefte`}</strong> von Hand verschoben. Tipp die Hand<span className="handmark"><HandIcon size={15} /></span> an, um ein Heft zurück in die automatische Sortierung zu geben.
          </span>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => release())}>Alle zurücksetzen</button>
        </div>
      )}
      {ids.length === 0 ? (
        <p className="mut">Im Plan liegt nichts, das sich ordnen ließe.</p>
      ) : (
        <ol className="ord issues" ref={ol} onPointerMove={onPointerMove}
          onPointerUp={() => { if (dragging !== null) { const id = dragging; setDragging(null); commit(id, ids); } }}
          onPointerCancel={() => { setDragging(null); setIds(key.split(",").map(Number)); }}>
          {ids.map((id, k) => {
            const it = byId.get(id);
            if (!it) return null;
            const e = entry.get(id);
            const day = label(id);
            const first = k === 0 || label(ids[k - 1]) !== day;
            const title = issueTitle(it.issue, it.series);
            return (
              <li key={id} className={`${dragging === id ? "drag" : ""} ${first && k > 0 ? "newday" : ""}`}>
                <button type="button" className="grip" aria-label={`${title} verschieben, Pfeiltasten hoch und runter`} disabled={busy}
                  onPointerDown={(ev) => { ev.preventDefault(); (ev.currentTarget.closest("ol") as HTMLElement).setPointerCapture(ev.pointerId); setDragging(id); }}
                  onKeyDown={(ev) => {
                    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
                    ev.preventDefault();
                    const to = k + (ev.key === "ArrowUp" ? -1 : 1);
                    if (to < 0 || to >= ids.length) return;
                    const next = [...ids];
                    next.splice(k, 1);
                    next.splice(to, 0, id);
                    setIds(next);
                    commit(id, next);
                  }}>
                  {GRIP}
                </button>
                <Cover issue={it.issue} readable={it.readable} showNumber={false} eventMark={false} />
                <span className="t">
                  <strong>{title}</strong>
                  {e?.added && <span className="mut" style={{ fontSize: 13 }}>Neu einsortiert</span>}
                </span>
                {e?.manual && (
                  <button type="button" className="iconbtn hand" disabled={busy} title="Von Hand verschoben. Zurück in die automatische Sortierung"
                    aria-label={`${title} ist von Hand verschoben. Zurück in die automatische Sortierung`} onClick={() => run(() => release(id))}>
                    <HandIcon />
                  </button>
                )}
                <span className={`day d ${first ? "" : "same"}`} aria-label={first ? undefined : day}>{first ? day : ""}</span>
              </li>
            );
          })}
        </ol>
      )}
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </>
  );
}
