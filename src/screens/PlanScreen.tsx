import { useLayoutEffect, useMemo, useRef } from "react";
import { actions, useStore } from "../lib/store";
import { dayLabel, shortDate } from "../lib/dates";
import { issueTitle, runsLabel } from "../lib/labels";
import { Cover } from "../components/Cover";
import { useRun } from "../components/useRun";
import { RIP_RELEASE_MS, ripCover, tapeOn } from "../lib/rip";
import { eventHex } from "../lib/events";
import type { EventMark } from "../lib/store";
import type { Issue } from "../lib/types";

const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

export function PlanScreen({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }) {
  const { data, plan, stalled, today, items, events, eventOf } = useStore();
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
    const readToday = items.filter((i) => i.ui.status === "read" && i.ui.read_on === today).length;
    const byId = new Map(items.map((i) => [i.issue.id, i]));
    const waiting = stalled.flatMap(({ issueId, behind }) => {
      const it = byId.get(issueId);
      return it ? [{ it, behind }] : [];
    });
    // A started event whose next issue is not readable yet waits for it.
    const paused = events.flatMap((v) => {
      if (v.read === 0) return [];
      const it = v.order.map((i) => byId.get(i.id)).find((x) => x && x.ui.status !== "read");
      return it && !it.readable ? [{ v, it, part: v.order.findIndex((i) => i.id === it.issue.id) + 1 }] : [];
    });
    return { tonight, next, soon, pileCount, readToday, waiting, paused };
  }, [data, plan, stalled, today, items, events]);

  const wall = useRef<HTMLElement>(null);
  useSlideOver(wall);

  if (!view) return null;
  const { tonight, next, soon, pileCount, readToday, waiting, paused } = view;
  const marks = tonight.map(({ issue }) => eventOf.get(issue.id));
  const banded = marks.some(Boolean);

  // The cover tears off right away; the plan reshuffles once the halves are falling clear.
  const markRead = async (issueId: number, card: HTMLElement | null) => {
    const cv = card?.querySelector<HTMLElement>(".cv");
    const rip = cv ? ripCover(cv) : null;
    const ok = await run(() => Promise.all([actions.markRead(issueId, today), wait(RIP_RELEASE_MS)]));
    if (!ok) rip?.restore();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="stk" style={{ transform: "rotate(-1deg)", fontSize: 14, padding: "3px 8px" }}>{dayLabel(today)}</span>
        <span className="d tally">
          <span>STAPEL: {pileCount}</span>
          {readToday > 0 && <span>HEUTE GELESEN: <span key={readToday} className="bump">{readToday}</span></span>}
        </span>
      </div>
      <h1 style={{ fontSize: "clamp(48px, 15vw, 60px)", lineHeight: 0.92 }}>Heute<br />Abend</h1>
      {tonight.length > 0 ? (
        <>
          <span style={{ fontSize: 16 }}>Am Stück: <strong>{runsLabel(tonight)}</strong></span>
          <section aria-label="Heute Abend lesen" className="tonight" ref={wall}>
            {tonight.map(({ issue, series }, k) => (
              <div key={issue.id} data-id={issue.id}>
                {banded && <Band marks={marks} k={k} />}
                <button type="button" onClick={() => onSelect(issue.id)} aria-label={`${issueTitle(issue, series)} öffnen`}
                  style={{ padding: 0, border: "none", background: "none", cursor: "pointer" }}>
                  <Cover issue={issue} tape={!marks[k]} eventMark={false} big className={selected === issue.id ? "selected" : ""}
                    style={selected === issue.id ? { outline: "3px solid var(--pink)", outlineOffset: 3 } : undefined} />
                </button>
                <button type="button" className="btn" disabled={busy} aria-label={`${issueTitle(issue, series)} als gelesen markieren`}
                  onClick={(e) => markRead(issue.id, e.currentTarget.parentElement)}>Gelesen</button>
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
              <span className={k === next.length - 1 ? "mut" : ""} style={{ fontSize: 16 }}>
                <EventTags issues={e.list.map((x) => x.issue)} marks={eventOf} />{runsLabel(e.list)}
              </span>
            </div>
          ))}
        </section>
      )}

      {(waiting.length > 0 || paused.length > 0) && (
        <section aria-label="Serien, die warten" style={{ borderTop: "3px solid var(--ink)", display: "flex", flexDirection: "column" }}>
          {paused.map(({ v, it, part }) => (
            <button key={`e${v.event.id}`} type="button" className="evening waitrow" onClick={() => onSelect(it.issue.id)}>
              <span className="d">WARTET</span>
              <span style={{ fontSize: 16 }}>
                <span className="btag" style={{ background: eventHex(v.event.color) }}>{v.event.short}</span>
                <strong>{v.event.name}</strong> Teil {part}, {issueTitle(it.issue, it.series)} {it.readableFrom ? `ist ab ${shortDate(it.readableFrom)} lesbar` : waitReason(it.ui.format)}
              </span>
            </button>
          ))}
          {waiting.map(({ it, behind }) => (
            <button key={it.issue.id} type="button" className="evening waitrow" onClick={() => onSelect(it.issue.id)}>
              <span className="d">WARTET</span>
              <span style={{ fontSize: 16 }}>
                <strong>{issueTitle(it.issue, it.series)}</strong> {waitReason(it.ui.format)}, dahinter {behind === 1 ? "1 Heft" : `${behind} Hefte`}
              </span>
            </button>
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

/**
 * Tonight's event band, one piece per cover: the pieces of covers from the
 * same event run into one strip, with the name at its start and the parts at its end.
 */
function Band({ marks, k }: { marks: (EventMark | undefined)[]; k: number }) {
  const m = marks[k];
  if (!m) return <span className="evband none" aria-hidden="true" />;
  const same = (j: number) => marks[j]?.event.id === m.event.id;
  const first = !same(k - 1);
  const last = !same(k + 1);
  let a = k;
  while (same(a - 1)) a--;
  let b = k;
  while (same(b + 1)) b++;
  const from = marks[a]!.part;
  const to = marks[b]!.part;
  const parts = from === to ? `TEIL ${from}/${m.total}` : `TEIL ${from}–${to}/${m.total}`;
  return (
    <span className={`evband ${first ? "first" : ""} ${last ? "last" : "join"}`} style={{ background: eventHex(m.event.color) }}>
      {first && <span className="n">{m.event.name}</span>}
      {last && <span className="t">{parts}</span>}
    </span>
  );
}

/** "K.O. 6–7" in front of an evening that goes on with an event. */
export function EventTags({ issues, marks }: { issues: Issue[]; marks: Map<number, EventMark> }) {
  const runs = new Map<number, { m: EventMark; from: number; to: number }>();
  for (const i of issues) {
    const m = marks.get(i.id);
    if (!m) continue;
    const r = runs.get(m.event.id);
    if (r) r.to = m.part;
    else runs.set(m.event.id, { m, from: m.part, to: m.part });
  }
  return (
    <>
      {[...runs.values()].map(({ m, from, to }) => (
        <span key={m.event.id} className="btag" style={{ background: eventHex(m.event.color) }}>
          {m.event.short} {from === to ? from : `${from}–${to}`}/{m.total}
        </span>
      ))}
    </>
  );
}

function waitReason(format: string | null): string {
  if (format === "print") return "ist nicht als gekauft markiert";
  if (format === "infinite") return "hat noch kein Erscheinungsdatum";
  return "hat kein Format";
}

/** Slides the remaining covers over (FLIP) and tapes newly planned ones on. */
function useSlideOver(ref: React.RefObject<HTMLElement>) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const prev = last.current;
    const now = new Map<string, { x: number; y: number }>();
    for (const el of Array.from(ref.current?.children ?? []) as HTMLElement[]) {
      const id = el.dataset.id!;
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      now.set(id, pos);
      const was = prev.get(id);
      if (was && (was.x !== pos.x || was.y !== pos.y)) {
        el.animate([{ transform: `translate(${was.x - pos.x}px, ${was.y - pos.y}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      } else if (!was && prev.size > 0) {
        const cv = el.querySelector<HTMLElement>(".cv");
        if (cv) tapeOn(cv, 120);
      }
    }
    last.current = now;
  });
}
