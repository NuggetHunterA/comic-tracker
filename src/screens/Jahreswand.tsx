import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useStore } from "../lib/store";
import { monthLabel } from "../lib/dates";
import { gradeLabel } from "../lib/stats";
import { issueTitle, seriesLong, seriesTitle } from "../lib/labels";
import { verlagOf } from "../lib/publisher";
import { MONTH_NAMES, readingYears, yearStats, type YearRead } from "../lib/yearStats";
import { Cover } from "../components/Cover";
import { BackButton } from "../components/Detail";

const hefte = (n: number) => (n === 1 ? "1 Heft" : `${n} Hefte`);
/** "30. OKT" */
const stampDate = (iso: string) => `${Number(iso.slice(8, 10))}. ${monthLabel(iso)}`;
/** A steady tilt per issue, at most 1.8 degrees either way, so the wall looks hand-taped but never jumps. */
const tilt = (id: number) => {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return `${((x - Math.floor(x)) * 3.6 - 1.8).toFixed(2)}deg`;
};

/** The plan shows the finished year from this day on. */
export const TEASER_FROM = "-12-20";
const SEEN = (year: number) => `comics:jahreswand-gesehen:${year}`;
export function wallSeen(year: number): boolean {
  try { return window.localStorage.getItem(SEEN(year)) === "1"; } catch { return false; }
}
export function markWallSeen(year: number) {
  try { window.localStorage.setItem(SEEN(year), "1"); } catch { /* the teaser just shows again */ }
}

/** The year's dated reads, ready for yearStats. */
export function useYear(year: number) {
  const { data, items, today } = useStore();
  return useMemo(() => {
    const reads: YearRead[] = items.filter((i) => i.ui.status === "read" && i.ui.read_on).map((i) => ({
      issueId: i.issue.id, seriesId: i.issue.series_id, number: i.issue.number, sortNumber: i.issue.sort_number,
      readOn: i.ui.read_on!, rating: i.ui.rating, storeDate: i.issue.store_date, verlag: verlagOf(i.series),
    }));
    const stats = yearStats(reads, year, today, (id) => seriesTitle(data?.series.get(id)));
    const years = readingYears(reads.map((r) => r.readOn), today);
    return { stats, years };
  }, [items, data, today, year]);
}

/**
 * Every issue read in a year, taped up by reading date with the best five large,
 * under a flyer with the year's numbers. On open, the copier prints the flyer
 * line by line, then the covers go up month by month; a tap skips it.
 */
export function Jahreswand({ year, wide, selected, onIssue, onYear, onBack }: {
  year: number; wide: boolean; selected?: number;
  onIssue: (id: number) => void; onYear: (y: number) => void; onBack: () => void;
}) {
  const { data, items, today } = useStore();
  const { stats, years } = useYear(year);
  const [play, setPlay] = useState<"play" | "skip">("play");
  const [torn, setTorn] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const col = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(items.map((i) => [i.issue.id, i])), [items]);

  useEffect(() => {
    // Seen counts once the year is done printing; an early look keeps the December strip in the plan.
    if (today >= `${year}${TEASER_FROM}`) markWallSeen(year);
    setPlay("play");
    setTorn(new Set());
    setNote(null);
  }, [year, today]);

  if (!data) return null;

  if (stats.count === 0) {
    return (
      <div className="jw">
        <BackButton onClick={onBack}>Bilanz</BackButton>
        <div className="empty">
          <strong style={{ fontSize: 17 }}>{year} ist noch leer.</strong>
          <span className="mut">Jedes Heft, das du als gelesen abhakst, kommt hier an die Wand.</span>
        </div>
      </div>
    );
  }

  // Covers go up within about a second however many there are.
  const step = Math.min(38, 1100 / stats.count);
  let k = 0;
  const delay = () => `${Math.round(k++ * step) + 1250}ms`;
  const best = stats.bestSeries ? data.series.get(stats.bestSeries.seriesId) : undefined;
  const bestIssue = stats.bestIssue ? byId.get(stats.bestIssue.issueId) : undefined;
  const dcPct = Math.round((stats.dc / Math.max(1, stats.dc + stats.marvel)) * 100);

  const tear = (e: MouseEvent<HTMLButtonElement>, key: string) => {
    if (torn.has(key)) return;
    // The slip falls away as a loose copy, so the flyer underneath may re-render.
    const host = col.current;
    const slip = e.currentTarget;
    if (host && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const r = slip.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const copy = slip.cloneNode(true) as HTMLElement;
      copy.className = "jw-fall";
      Object.assign(copy.style, { left: `${r.left - h.left}px`, top: `${r.top - h.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      host.appendChild(copy);
      window.setTimeout(() => copy.remove(), 700);
    }
    setTorn(new Set(torn).add(key));
    setNote(key);
  };
  const shown = stats.facts.find((f) => f.key === note);

  return (
    <div className={`jw ${wide ? "wide" : ""} ${play}`} onPointerDown={() => setPlay("skip")}>
      <div className="jw-bar">
        <BackButton onClick={onBack}>Bilanz</BackButton>
        <h1>Jahreswand</h1>
        {years.length > 1 && (
          <div className="jw-years" role="group" aria-label="Jahr">
            {years.map((y) => (
              <button key={y} type="button" className={`chip ${y === year ? "on" : ""}`} aria-pressed={y === year} onClick={() => onYear(y)}>{y}</button>
            ))}
          </div>
        )}
      </div>

      <div className="jw-body">
        <div className="jw-col" ref={col}>
          <div className="jw-press">
            <article className="jw-flyer" aria-label={`Rückblick ${year}`}>
              <i className="tape l" /><i className="tape r" />
              <div className="jw-yr">{year}</div>
              <div className="jw-span d">
                {stats.first && stampDate(stats.first)} – {stats.open ? "HEUTE" : "31. DEZ"}
                <span className="stk">{stats.open ? "LÄUFT NOCH" : "FERTIG GEDRUCKT"}</span>
              </div>
              <div className="jw-lineup">
                <span className="a"><em>{stats.count}</em> {stats.count === 1 ? "Heft" : "Hefte"}</span>
                <span className="b">an {stats.evenings} {stats.evenings === 1 ? "Abend" : "Abenden"}</span>
                {stats.longestRun > 1 && <span className="c">{stats.longestRun} Abende in Folge</span>}
              </div>
              <div className="jw-facts">
                {best && stats.bestSeries && (
                  <div className="kv"><span>BESTE SERIE</span><strong>{seriesLong(best)} <span className="d">Ø {gradeLabel(stats.bestSeries.avg)}</span></strong></div>
                )}
                {bestIssue && stats.bestIssue && (
                  <div className="kv"><span>BESTES HEFT</span><strong>{issueTitle(bestIssue.issue, bestIssue.series)}<span className="g">{stats.bestIssue.rating}</span></strong></div>
                )}
                {stats.strongestMonth && (
                  <div className="kv"><span>STÄRKSTER MONAT</span><strong>{MONTH_NAMES[stats.strongestMonth.month]} <span className="d">{stats.strongestMonth.count}</span></strong></div>
                )}
                {stats.dc + stats.marvel > 0 && (
                  <div className="jw-pub">
                    <span className="d"><span>DC {dcPct} %</span><span>MARVEL {100 - dcPct} %</span></span>
                    <span className="jw-pubbar" role="img" aria-label={`DC ${hefte(stats.dc)}, Marvel ${hefte(stats.marvel)}`}>
                      <i className="dc" style={{ flexGrow: stats.dc }} /><i className="marvel" style={{ flexGrow: stats.marvel }} />
                    </span>
                  </div>
                )}
              </div>
              {stats.facts.length > 0 && (
                <div className="jw-slips" style={{ gridTemplateColumns: `repeat(${stats.facts.length}, 1fr)` }}>
                  {stats.facts.map((f) => (
                    <button key={f.key} type="button" className={`jw-slip ${torn.has(f.key) ? "torn" : ""}`} disabled={torn.has(f.key)}
                      aria-label={`Fun Fact abreißen: ${f.label}`} onClick={(e) => tear(e, f.key)}>
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </article>
            <i className="jw-laser" aria-hidden="true" />
          </div>
          <div aria-live="polite">
            {shown && (
              <div key={shown.key} className="jw-note">
                <i className="tape" />
                <h2 className="d">{shown.label}</h2>
                <p>{shown.text}</p>
              </div>
            )}
          </div>
        </div>

        <div className="jw-wall" aria-label={`Alle gelesenen Hefte ${year}, nach Lesedatum`}>
          {stats.months.map((m) => {
            const head = delay();
            return (
              <section key={m.month} className={`jw-month ${m.reads.length ? "" : "empty"}`} aria-label={`${MONTH_NAMES[m.month]}: ${hefte(m.reads.length)}`}>
                <div className="jw-mhead">
                  <h2 style={{ "--dl": head } as CSSProperties}>{monthLabel(`${year}-${String(m.month + 1).padStart(2, "0")}-01`)}</h2>
                  <span className="d">{m.reads.length ? hefte(m.reads.length).toUpperCase() : "NICHTS GELESEN"}</span>
                </div>
                {m.reads.length > 0 && (
                  <div className="jw-grid">
                    {m.reads.map((r) => {
                      const it = byId.get(r.issueId);
                      if (!it) return null;
                      const top = stats.top.includes(r.issueId);
                      return (
                        <button key={r.issueId} type="button" className={`jw-item ${top ? "top" : ""} ${selected === r.issueId ? "on" : ""}`}
                          style={{ "--dl": delay(), "--r": tilt(r.issueId) } as CSSProperties}
                          aria-label={`${issueTitle(it.issue, it.series)}${r.rating ? `, Note ${r.rating}` : ", ohne Note"}`}
                          onClick={() => onIssue(r.issueId)}>
                          <Cover issue={it.issue} tape={top || r.issueId % 3 === 0} big={top} eventMark={false}>
                            {top && <span className="jw-grade">{r.rating}<b>/10</b></span>}
                          </Cover>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
