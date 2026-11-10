import { useMemo } from "react";
import { useStore } from "../lib/store";
import { dayLabel, monthLabel, shortDate } from "../lib/dates";
import { issueTitle, seriesLong } from "../lib/labels";
import { MIN_RATED, gradeLabel, readingStats } from "../lib/stats";
import { Cover } from "../components/Cover";
import type { StapelSel } from "./StapelScreen";
import { verlagOf } from "../lib/publisher";

const DAYS = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
const hefte = (n: number) => (n === 1 ? "1 Heft" : `${n} Hefte`);

/** What has been read: this week, the weeks before, the best issues and series. */
export function Bilanz({ sel, onSelect }: { sel: StapelSel; onSelect: (s: StapelSel) => void }) {
  const { data, items, today } = useStore();
  const reads = useMemo(() => items.filter((i) => i.ui.status === "read"), [items]);
  const stats = useMemo(
    () => readingStats(reads.map((i) => ({ issueId: i.issue.id, seriesId: i.issue.series_id, readOn: i.ui.read_on, rating: i.ui.rating })), today),
    [reads, today],
  );
  if (!data) return null;
  const byId = new Map(reads.map((i) => [i.issue.id, i]));

  if (stats.total === 0) {
    return (
      <div className="empty">
        <strong style={{ fontSize: 17 }}>Noch nichts gelesen.</strong>
        <span className="mut">Sobald du ein Heft als gelesen abhakst und benotest, steht hier, was du liest und was dir am besten gefällt.</span>
      </div>
    );
  }

  const { week, weeks } = stats;
  const thisWeek = week.days.flatMap((d) => d.ids).reverse().map((id) => byId.get(id)!).filter(Boolean);
  const dayMax = Math.max(3, ...week.days.map((d) => d.ids.length));
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));
  const peak = weeks.reduce((m, w, k) => (w.count > weeks[m].count ? k : m), 0);
  const gradeMax = Math.max(1, ...stats.grades);
  const issueOn = (id: number) => sel?.kind === "issue" && sel.id === id;

  return (
    <div className="bilanz">
      <section aria-labelledby="bz-week">
        <h2 id="bz-week" className="bz-head"><span className="bz-n">{week.count}</span> {week.count === 1 ? "Heft" : "Hefte"} diese Woche</h2>
        <span className="d mut bz-sub">
          LETZTE WOCHE {stats.lastWeek}{stats.streak > 1 ? ` · ${stats.streak} ABENDE IN FOLGE` : ""}
        </span>
        <div className="bz-days">
          {week.days.map((d, k) => {
            const future = d.date > today;
            return (
              <div key={d.date} className={`bz-day ${future ? "later" : ""}`} aria-label={`${dayLabel(d.date)}: ${hefte(d.ids.length)}`} role="img">
                <span className="bz-ticks" style={{ height: dayMax * 15 }}>
                  {d.ids.map((id) => <i key={id} />)}
                </span>
                {d.date === today ? <span className="stk">{DAYS[k]}</span> : <span className="d">{DAYS[k]}</span>}
              </div>
            );
          })}
        </div>
        {thisWeek.length > 0 && (
          <div className="bz-strip">
            {thisWeek.map((i) => (
              <button key={i.issue.id} type="button" className={issueOn(i.issue.id) ? "on" : ""} aria-label={issueTitle(i.issue, i.series)}
                onClick={() => onSelect({ kind: "issue", id: i.issue.id })}>
                <Cover issue={i.issue} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="bz-weeks">
        <h2 id="bz-weeks" className="bz-h">Zwölf Wochen</h2>
        <div className="bz-bars" role="img" aria-label={weeks.map((w) => `Woche ab ${shortDate(w.start)}: ${hefte(w.count)}`).join(", ")}>
          {weeks.map((w, k) => {
            const now = k === weeks.length - 1;
            return (
              <div key={w.start} className={`bz-bar ${now ? "now" : ""}`} title={`Woche ab ${shortDate(w.start)}: ${hefte(w.count)}`}>
                {(now || k === peak) && w.count > 0 && <span className="d">{w.count}</span>}
                <i style={{ height: `${(w.count / weekMax) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <div className="bz-axis d">
          <span>{shortDate(weeks[0].start)}</span>
          <span>{shortDate(weeks[6].start)}</span>
          <span>JETZT</span>
        </div>
      </section>

      <Verlage reads={reads} from={weeks[0].start} today={today} />

      <section aria-label="Zahlen" className="bz-kv">
        <div className="kv"><span>{monthLabel(today)}</span><span>{hefte(stats.month)}</span></div>
        <div className="kv"><span>{today.slice(0, 4)}</span><span>{hefte(stats.year)}</span></div>
        <div className="kv"><span>GESAMT</span><span>{hefte(stats.total)} gelesen</span></div>
        <div className="kv"><span>Ø NOTE</span><span>{stats.avg === null ? "noch keine Noten" : <>{gradeLabel(stats.avg)} <span className="mut">aus {stats.rated} {stats.rated === 1 ? "Note" : "Noten"}</span></>}</span></div>
      </section>

      <section aria-labelledby="bz-issues">
        <h2 id="bz-issues" className="bz-h">Beste Hefte</h2>
        {stats.topIssues.length === 0 ? (
          <p className="mut bz-note">Noch keine Noten. Gib einem Heft nach dem Lesen eine Note von 1 bis 10.</p>
        ) : (
          <ol className="bz-rank">
            {stats.topIssues.map((r, k) => {
              const i = byId.get(r.issueId);
              if (!i) return null;
              return (
                <li key={r.issueId}>
                  <button type="button" className={issueOn(r.issueId) ? "on" : ""} onClick={() => onSelect({ kind: "issue", id: r.issueId })}>
                    <span className="no">{k + 1}</span>
                    <Cover issue={i.issue} showNumber={false} />
                    <span className="t">
                      <strong>{issueTitle(i.issue, i.series)}</strong>
                      <span className="d mut">{r.readOn ? dayLabel(r.readOn) : "früher gelesen"}</span>
                    </span>
                    <span className="gstamp">{r.rating}<b>/10</b></span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="bz-series">
        <h2 id="bz-series" className="bz-h">Beste Serien</h2>
        {stats.topSeries.length === 0 ? (
          <p className="mut bz-note">Eine Serie kommt hierher, sobald {MIN_RATED} ihrer Hefte eine Note haben.</p>
        ) : (
          <ol className="bz-rank">
            {stats.topSeries.map((s, k) => {
              const best = byId.get(s.best);
              const on = (sel?.kind === "series" || sel?.kind === "all") && sel.id === s.seriesId;
              return (
                <li key={s.seriesId}>
                  <button type="button" className={on ? "on" : ""} onClick={() => onSelect({ kind: "all", id: s.seriesId })}>
                    <span className="no">{k + 1}</span>
                    {best && <Cover issue={best.issue} showNumber={false} />}
                    <span className="t">
                      <strong>{seriesLong(data.series.get(s.seriesId))}</strong>
                      <span className="d mut">{s.rated} BENOTET</span>
                    </span>
                    <span className="gstamp avg"><b>Ø</b>{gradeLabel(s.avg)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {stats.rated > 0 && (
        <section aria-labelledby="bz-grades">
          <h2 id="bz-grades" className="bz-h">Deine Noten</h2>
          <div className="bz-grades" role="img" aria-label={stats.grades.map((n, k) => `Note ${k + 1}: ${n}`).join(", ")}>
            {stats.grades.map((n, k) => (
              <div key={k} className="bz-bar" title={`Note ${k + 1}: ${hefte(n)}`}>
                {n > 0 && <span className="d">{n}</span>}
                <i style={{ height: `${(n / gradeMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bz-gaxis">
            {stats.grades.map((_, k) => <span key={k}>{k + 1}</span>)}
          </div>
          {stats.unrated > 0 && (
            <p className="mut bz-note">{stats.unrated === 1 ? "1 Heft mit Lesedatum hat" : `${stats.unrated} Hefte mit Lesedatum haben`} noch keine Note.</p>
          )}
        </section>
      )}
    </div>
  );
}

/** How the last twelve weeks split between DC and Marvel, as one bar. */
function Verlage({ reads, from, today }: { reads: ReturnType<typeof useStore>["items"]; from: string; today: string }) {
  const n = { dc: 0, marvel: 0, other: 0 };
  for (const i of reads) if (i.ui.read_on && i.ui.read_on >= from && i.ui.read_on <= today) n[verlagOf(i.series)]++;
  const total = n.dc + n.marvel + n.other;
  if (total === 0) return null;
  const pct = (x: number) => Math.round((x / total) * 100);
  const parts = (["dc", "marvel", "other"] as const).filter((v) => n[v] > 0);
  const label = { dc: "DC", marvel: "Marvel", other: "Andere" };
  return (
    <section aria-labelledby="bz-verlage">
      <h2 id="bz-verlage" className="bz-h">DC und Marvel</h2>
      <div className="bz-split" role="img" aria-label={parts.map((v) => `${label[v]}: ${hefte(n[v])}, ${pct(n[v])} Prozent`).join(", ")}>
        {parts.map((v) => <i key={v} className={v} style={{ flexGrow: n[v] }} />)}
      </div>
      <div className="bz-splitkey d">
        {parts.map((v) => <span key={v}><b>{label[v].toUpperCase()} {pct(n[v])} %</b> · {n[v]}</span>)}
      </div>
    </section>
  );
}
