import { useEffect, useRef, useState } from "react";
import { actions, useStore, type EventView } from "../lib/store";
import { EVENT_COLORS, defaultShort, eventHex, seriesGaps } from "../lib/events";
import { dayLabel, shortDate } from "../lib/dates";
import { issueTitle, runsLabel, seriesTitle } from "../lib/labels";
import type { Format, Issue } from "../lib/types";
import { Cover } from "./Cover";
import { AllIssues } from "./AllIssues";
import { BackButton } from "./Detail";
import { SeriesSearch, type FoundSeries } from "./SeriesSearch";
import { useRun } from "./useRun";

type Tick = "r" | "h" | "o" | "w";

/** Each issue's state for the tick row: read, tonight, open, not readable yet. */
export function useTicks(view: EventView): Tick[] {
  const { data, plan, today, items } = useStore();
  const tonight = new Set(plan.find((e) => e.date === today)?.entries.map((x) => x.issueId) ?? []);
  const byId = new Map(items.map((i) => [i.issue.id, i]));
  return view.order.map((i) => {
    const it = byId.get(i.id);
    if (data?.userIssues.get(i.id)?.status === "read") return "r";
    if (tonight.has(i.id)) return "h";
    return it?.readable ? "o" : "w";
  });
}

export function Ticks({ view, small }: { view: EventView; small?: boolean }) {
  const ticks = useTicks(view);
  const hex = eventHex(view.event.color);
  const label = `${view.read} von ${view.order.length} gelesen`;
  return (
    <span className={`ticks ${small ? "s" : ""}`} role="img" aria-label={label}>
      {ticks.map((t, k) => <i key={k} className={t} style={t === "h" ? { background: hex } : undefined} />)}
    </span>
  );
}

/** One event: its reading order, kept by hand, plus name, Kürzel and colour. */
export function EventDetail({ eventId, onGone }: { eventId: number; onGone: () => void }) {
  const { data, events, items, plan, today } = useStore();
  const { run, busy, error } = useRun();
  const [adding, setAdding] = useState<FoundSeries | "search" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const view = events.find((v) => v.event.id === eventId);
  if (!data) return null;
  if (!view) return <p className="mut">Das Event gibt es nicht mehr.</p>;
  const { event, order } = view;
  const hex = eventHex(event.color);
  const byId = new Map(items.map((i) => [i.issue.id, i]));
  const isOpen = (i: Issue) => {
    const st = data.userIssues.get(i.id)?.status;
    return st === "pile" || st === "expected";
  };
  const gaps = seriesGaps(order, isOpen, items.map((i) => i.issue));
  const tonight = new Set(plan.find((e) => e.date === today)?.entries.map((x) => x.issueId) ?? []);
  const when = new Map<number, string>();
  for (const e of plan) for (const x of e.entries) if (!when.has(x.issueId)) when.set(x.issueId, e.date);

  const formatFor = (i: Issue): Format => {
    const f = data.followed.find((x) => x.series_id === i.series_id)?.default_format;
    return f ?? ((data.series.get(i.series_id)?.publisher ?? "").toLowerCase().startsWith("dc") ? "infinite" : "print");
  };
  const toggle = (issueId: number) => {
    const issue = data.issues.get(issueId);
    if (!issue) return;
    run(() => (order.some((o) => o.id === issueId) ? actions.removeFromEvent(issueId) : actions.addToEvent(view, issue, data.userIssues.get(issueId), formatFor(issue))));
  };

  if (adding && adding !== "search") {
    return (
      <AllIssues key={adding.id} seriesId={adding.id} onSelect={toggle}
        head={
          <>
            <BackButton onClick={() => setAdding(null)}>Zurück zu {event.name}</BackButton>
            <p className="mut" style={{ margin: 0, fontSize: 15 }}>Tipp Hefte an, um sie ins Event zu nehmen oder wieder herauszunehmen. Fehlende Hefte kommen dabei auf den Stapel.</p>
            {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
          </>
        } />
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ fontSize: 40, lineHeight: 0.95 }}>{event.name}</h2>
        <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Ticks view={view} />
          <span className="d" style={{ fontSize: 13 }}>{view.read} VON {order.length} GELESEN</span>
        </span>
      </div>

      {adding === "search" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Aus welcher Serie?</span>
          <SeriesSearch onPick={(s) => setAdding(s)} />
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(null)}>Abbrechen</button>
        </div>
      ) : (
        <button type="button" className="btn solid" style={{ alignSelf: "stretch" }} onClick={() => setAdding("search")}>Hefte hinzufügen</button>
      )}

      {order.length === 0 ? (
        <div className="empty">
          <strong>Noch keine Hefte im Event.</strong>
          <span className="mut">Such eine Serie und tipp die Hefte an, die dazugehören. Die Reihenfolge ergibt sich aus dem Erscheinungsdatum, du kannst sie danach von Hand ändern.</span>
        </div>
      ) : (
        <Order view={view} onCommit={(ids) => run(() => actions.reorderEvent(event.id, ids))} onRemove={(id) => run(() => actions.removeFromEvent(id))} busy={busy}
          state={(i) => {
            const it = byId.get(i.id);
            if (data.userIssues.get(i.id)?.status === "read") {
              const on = data.userIssues.get(i.id)?.read_on;
              return <span className="state mut">{on ? `GELESEN ${shortDate(on)}` : "GELESEN"}</span>;
            }
            if (tonight.has(i.id)) return <span className="state">HEUTE</span>;
            if (it && !it.readable) return it.readableFrom ? <span className="stk" style={{ fontSize: 11 }}>AB {shortDate(it.readableFrom)}</span> : <span className="state mut">{it.ui.format === "print" ? "NICHT GEKAUFT" : "OHNE DATUM"}</span>;
            const d = when.get(i.id);
            return <span className="state mut">{d ? dayLabel(d) : "OFFEN"}</span>;
          }} />
      )}

      {event.manual_order && order.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span className="d mut" style={{ fontSize: 12 }}>REIHENFOLGE VON HAND GEÄNDERT</span>
          <button type="button" className="btn dashed" disabled={busy} onClick={() => run(() => actions.sortEventByDate(event.id))}>Nach Erscheinungsdatum sortieren</button>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="hint">
          {gaps.map((g) => (
            <p key={g.seriesId}>
              <b>{runsLabel(g.missing.map((m) => ({ issue: m, series: data.series.get(m.series_id) })))}</b> {g.missing.length === 1 ? "ist" : "sind"} noch
              offen. Das Event liest #{g.before.number} vorher, {seriesTitle(data.series.get(g.seriesId))} geht danach bei #{g.missing[0].number} weiter.
            </p>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "3px solid var(--ink)", paddingTop: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Farbe im Plan und an den Covern</span>
        <div role="radiogroup" aria-label="Farbe des Events" className="swatches">
          {EVENT_COLORS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={event.color === c.id} aria-label={c.label} title={c.label}
              className={`sw ${event.color === c.id ? "on" : ""}`} style={{ background: c.hex }} disabled={busy}
              onClick={() => event.color !== c.id && run(() => actions.updateEvent(event.id, { color: c.id }))} />
          ))}
        </div>
  
        <NameFields key={`${event.name}|${event.short}`} name={event.name} short={event.short} hex={hex}
          onSave={(name, short) => run(() => actions.updateEvent(event.id, { name, short }))} busy={busy} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto", paddingTop: 8 }}>
        {confirmDelete ? (
          <div className="confirm" role="group" aria-label="Event löschen">
            <p>Löscht das Event {event.name}. Die Hefte bleiben auf dem Stapel und werden wieder normal eingeplant.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn hot" style={{ flex: 1 }} disabled={busy} onClick={() => run(async () => { await actions.deleteEvent(event.id); onGone(); })}>Event löschen</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmDelete(true)}>Event löschen</button>
        )}
      </div>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
    </>
  );
}

function NameFields({ name, short, hex, onSave, busy }: { name: string; short: string; hex: string; onSave: (name: string, short: string) => void; busy: boolean }) {
  const [n, setN] = useState(name);
  const [k, setK] = useState(short);
  const changed = n.trim() !== name || k.trim() !== short;
  return (
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 32 }}>Name und Kürzel ändern</summary>
      <form style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}
        onSubmit={(e) => { e.preventDefault(); if (n.trim() && changed) onSave(n.trim(), k.trim() || defaultShort(n)); }}>
        <label className="field">Name<input type="text" value={n} onChange={(e) => setN(e.target.value)} autoComplete="off" /></label>
        <label className="field">Kürzel auf den Covern
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="text" value={k} maxLength={10} onChange={(e) => setK(e.target.value)} autoComplete="off" style={{ width: 160 }} />
            <span className="btag" style={{ background: hex, fontSize: 13 }}>{k.trim() || defaultShort(n)} 3/7</span>
          </span>
        </label>
        <button type="submit" className="btn" style={{ alignSelf: "flex-start" }} disabled={busy || !n.trim() || !changed}>Speichern</button>
      </form>
    </details>
  );
}

/**
 * The reading order. Drag a row by its grip, or focus the grip and use the
 * arrow keys; the new order is saved when the row is let go.
 */
function Order({ view, onCommit, onRemove, state, busy }: {
  view: EventView;
  onCommit: (ids: number[]) => void;
  onRemove: (issueId: number) => void;
  state: (i: Issue) => React.ReactNode;
  busy: boolean;
}) {
  const { data, items } = useStore();
  const readable = new Set(items.filter((i) => i.readable && i.ui.status !== "read").map((i) => i.issue.id));
  const [ids, setIds] = useState(view.order.map((i) => i.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const key = view.order.map((i) => i.id).join(",");
  // Follow the saved order whenever it changes underneath.
  useEffect(() => setIds(key ? key.split(",").map(Number) : []), [key]);

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
    if (next.join(",") !== key) onCommit(next);
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

  return (
    <ol className="ord" ref={list} onPointerMove={onPointerMove}
      onPointerUp={() => { if (dragging !== null) { setDragging(null); commit(ids); } }}
      onPointerCancel={() => { setDragging(null); setIds(key.split(",").map(Number)); }}>
      {ids.map((id, k) => {
        const issue = data?.issues.get(id);
        if (!issue) return null;
        const series = data?.series.get(issue.series_id);
        const read = data?.userIssues.get(id)?.status === "read";
        return (
          <li key={id} className={`${read ? "done" : ""} ${dragging === id ? "drag" : ""}`}>
            <button type="button" className="grip" aria-label={`${issueTitle(issue, series)} verschieben, Pfeiltasten hoch und runter`} disabled={busy}
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
              <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="3" r="1.8" /><circle cx="9" cy="3" r="1.8" /><circle cx="3" cy="10" r="1.8" /><circle cx="9" cy="10" r="1.8" /><circle cx="3" cy="17" r="1.8" /><circle cx="9" cy="17" r="1.8" />
              </svg>
            </button>
            <span className="no">{k + 1}</span>
            <Cover issue={issue} showNumber={false} eventMark={false} readable={readable.has(id)} />
            <span className="t">
              <strong>{issueTitle(issue, series)}</strong>
              <span>{state(issue)}</span>
            </span>
            <button type="button" className="iconbtn" aria-label={`${issueTitle(issue, series)} aus dem Event nehmen`} disabled={busy} onClick={() => onRemove(id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A new event: just the name; colour and Kürzel come preset and can be changed after. */
export function NewEvent({ onMade }: { onMade: (eventId: number) => void }) {
  const { events } = useStore();
  const { run, busy, error } = useRun();
  const [name, setName] = useState("");
  return (
    <form style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={(e) => {
      e.preventDefault();
      const n = name.trim();
      if (!n) return;
      let id = 0;
      run(async () => { id = await actions.createEvent(n, defaultShort(n), EVENT_COLORS[events.length % EVENT_COLORS.length].id); })
        .then((ok) => { if (ok) { setName(""); onMade(id); } });
    }}>
      <div className="jump">
        <label className="sr-only" htmlFor="new-event">Name des neuen Events</label>
        <input id="new-event" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Neues Event, z. B. DC K.O." autoComplete="off" style={{ width: "auto", flex: 1 }} />
        <button type="submit" className="btn solid" disabled={busy || !name.trim()}>Anlegen</button>
      </div>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal", margin: 0 }}>{error}</p>}
    </form>
  );
}
