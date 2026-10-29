import { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { actions, useStore } from "../lib/store";
import { addDays, dateLabel, dayLabel, shortDate } from "../lib/dates";
import { FORMAT_LABEL, issueTitle } from "../lib/labels";
import { readableFrom } from "../lib/plan";
import type { Format, Issue } from "../lib/types";
import { Cover } from "./Cover";
import { FormatChips } from "./FormatChips";
import { useRun } from "./useRun";
import { RIP_MS, ripCover } from "../lib/rip";
import { useInfiniteHref } from "../lib/infiniteLink";


export function IssueDetail({ issueId, onClose }: { issueId: number; onClose?: () => void }) {
  const { data, today, plan } = useStore();
  const { run, busy, error } = useRun();
  const [pickFormat, setPickFormat] = useState<Format>("infinite");
  const head = useRef<HTMLDivElement>(null);
  const issue = data?.issues.get(issueId);
  const series = issue ? data?.series.get(issue.series_id) : undefined;
  const ui = data?.userIssues.get(issueId);
  // Look the issue page up only once it is out on Infinite; before that there is nothing to find.
  const unlocked = !!data && !!issue && (readableFrom(issue.store_date, "infinite", null, data.settings.infinite_delay_days) ?? "9999") <= today;
  const infiniteHref = useInfiniteHref(issue, series, ui?.format === "infinite" && ui.status !== "read" && unlocked);
  if (!data) return null;
  if (!issue) return <p className="mut">Heft nicht gefunden.</p>;
  const title = issueTitle(issue, series);
  const delay = data.settings.infinite_delay_days;
  const from = ui ? readableFrom(issue.store_date, ui.format, ui.bought_on, delay) : null;
  const readable = !!from && from <= today;
  const isDC = (series?.publisher ?? "").toLowerCase().startsWith("dc");
  const followed = data.followed.some((f) => f.series_id === issue.series_id);
  const followedFormat = data.followed.find((f) => f.series_id === issue.series_id)?.default_format;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
      <div ref={head} style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
        <Cover issue={issue} readable={!ui || readable || ui.status === "read"} showNumber={false} tape={ui?.status === "read" ? "GELESEN" : true} style={{ width: 126, flex: "none", transform: "rotate(-1.5deg)" }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ fontSize: 30, lineHeight: 1 }}>{title}</h2>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            {issue.store_date && (
              <div className="kv"><span>ERSCHEINT</span><span>{dateLabel(issue.store_date, today)}</span></div>
            )}
            {isDC && issue.store_date && (!ui || ui.format === "infinite") && (
              <div className="kv"><span>INFINITE</span>{addDays(issue.store_date, delay) <= today ? <span>Verfügbar</span> : <span><span className="stk">AB {shortDate(addDays(issue.store_date, delay))}</span></span>}</div>
            )}
            {ui && ui.format && (
              <div className="kv"><span>FORMAT</span><span>{FORMAT_LABEL[ui.format]}{ui.old_pile ? " · Altbestand" : ""}{ui.format !== "infinite" ? (ui.bought_on ? ` · gekauft ${shortDate(ui.bought_on)}` : " · noch nicht gekauft") : ""}</span></div>
            )}
            <ArcLine issueId={issueId} />
            {ui && <PlanLine issueId={issueId} plan={plan} today={today} />}
            {ui?.status === "read" && ui.read_on && <div className="kv"><span>GELESEN</span><span>{dayLabel(ui.read_on)}</span></div>}
          </div>
        </div>
      </div>

      {ui?.status === "read" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Bewertung</span>
          <div role="radiogroup" aria-label="Bewertung von 1 bis 10" className="ratings">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={ui.rating === n} className={`rt ${ui.rating === n ? "on" : ""}`} disabled={busy}
                onClick={() => run(() => actions.rate(issueId, ui.rating === n ? null : n))}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {(!ui || ui.status === "wishlist" || ui.status === "dismissed") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {isDC && (
            <>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Wie willst du es lesen?</span>
              <FormatChips value={pickFormat} onChange={setPickFormat} />
            </>
          )}
          {isDC && pickFormat === "infinite" && issue.store_date && addDays(issue.store_date, delay) > today && (
            <span className="mut" style={{ fontSize: 14 }}>Kommt in den Stapel und wird am <span className="stk">{shortDate(addDays(issue.store_date, delay))}</span> lesbar.</span>
          )}
          {isDC && pickFormat === "infinite" && issue.store_date && addDays(issue.store_date, delay) <= today && (
            <span className="mut" style={{ fontSize: 14 }}>Kommt in den Stapel und ist sofort lesbar.</span>
          )}
          {(!isDC || pickFormat !== "infinite") && <span className="mut" style={{ fontSize: 14 }}>Kommt in den Stapel. Lesbar, sobald du es als gekauft markierst.</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: "auto" }}>
        {!ui || ui.status === "dismissed" ? (
          <>
            <button type="button" className="btn solid" style={{ flex: "1 1 100%" }} disabled={busy} onClick={() => run(() => actions.markReadEarlier(issueId))}>Schon gelesen</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.addIssue(issueId, "pile", isDC ? pickFormat : "print"))}>Einplanen</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.addIssue(issueId, "wishlist", null))}>Auf die Wunschliste</button>
            {!followed && <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.follow(issue.series_id, isDC ? "infinite" : "print"))}>Serie folgen</button>}
          </>
        ) : ui.status === "wishlist" ? (
          <>
            <button type="button" className="btn solid" style={{ flex: 1 }} disabled={busy} onClick={() => run(() => actions.addIssue(issueId, "pile", isDC ? pickFormat : "print"))}>Auf den Stapel</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.markReadEarlier(issueId))}>Schon gelesen</button>
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await actions.dismissIssue(issueId); onClose?.(); })}>Von der Liste</button>
          </>
        ) : ui.status === "read" ? (
          // Read earlier (no format, no date) goes back to nothing, not onto the pile.
          <button type="button" className="btn" disabled={busy}
            onClick={() => run(() => (!ui.format && !ui.read_on ? actions.removeIssue(issueId) : actions.markUnread(issueId)))}>Doch nicht gelesen</button>
        ) : (
          <>
            {readable && <button type="button" className="btn solid" style={{ flex: 1 }} disabled={busy} onClick={async () => {
              // Tear the cover off, then tape it back on marked as read.
              const cv = head.current?.querySelector<HTMLElement>(".cv");
              const rip = cv ? ripCover(cv) : null;
              await run(() => Promise.all([actions.markRead(issueId, today), new Promise((done) => window.setTimeout(done, RIP_MS))]));
              rip?.restore();
            }}>Gelesen</button>}
            {ui.format !== "infinite" && !ui.bought_on && (
              <button type="button" className="btn solid" style={{ flex: 1 }} disabled={busy} onClick={() => run(() => actions.setBought(issueId, today))}>Gekauft</button>
            )}
            {readable && !ui.skip_plan && (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.pin(issueId, addDays(today, 1), 1))}>Auf morgen</button>
            )}
            {readable && !ui.skip_plan && !isTonight(plan, today, issueId) && (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.pin(issueId, today, 1))}>Heute lesen</button>
            )}
            {ui.skip_plan ? (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.skipPlan(issueId, false))}>Wieder einplanen</button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.skipPlan(issueId, true))}>Aus dem Plan</button>
            )}
            {ui.format === "infinite" && readable && (
              <a className="btn" href={infiniteHref} target={infiniteHref.startsWith("intent:") ? undefined : "_blank"} rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>In Infinite öffnen</a>
            )}
          </>
        )}
      </div>

      {issue.sort_number !== null && (!ui || ui.status === "wishlist" || ui.status === "dismissed" || ui.status === "read") && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
          <RangeAction issue={issue} mode="read" />
          <RangeAction issue={issue} mode="pile" format={followedFormat ?? (isDC ? "infinite" : "print")} />
        </div>
      )}

      {ui && ui.status !== "read" && ui.status !== "dismissed" && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 32 }}>{isDC ? "Format oder Stapel ändern" : "Stapel ändern"}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
            <FormatChips value={ui.format ?? "print"} allowInfinite={isDC} onChange={(f) => run(() => actions.setFormat(issueId, f))} />
            {ui.format !== "infinite" && ui.bought_on && (
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.setBought(issueId, null))} style={{ alignSelf: "flex-start" }}>Doch nicht gekauft</button>
            )}
            <button type="button" className="btn" disabled={busy} style={{ alignSelf: "flex-start" }} onClick={() => run(async () => { await actions.removeIssue(issueId); onClose?.(); })}>Vom Stapel entfernen</button>
          </div>
        </details>
      )}
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
    </div>
  );
}

function isTonight(plan: { date: string; entries: { issueId: number }[] }[], today: string, issueId: number) {
  return plan.some((e) => e.date === today && e.entries.some((x) => x.issueId === issueId));
}

function PlanLine({ issueId, plan, today }: { issueId: number; plan: { date: string; entries: { issueId: number; pinned: boolean }[] }[]; today: string }) {
  for (const e of plan) {
    const idx = e.entries.findIndex((x) => x.issueId === issueId);
    if (idx < 0) continue;
    const when = e.date === today ? "Heute" : e.date === addDays(today, 1) ? "Morgen" : dayLabel(e.date);
    return (
      <div className="kv"><span>GEPLANT</span><span>{when}, {idx + 1} von {e.entries.length}{e.entries[idx].pinned ? " · fest" : ""}</span></div>
    );
  }
  return null;
}

function ArcLine({ issueId }: { issueId: number }) {
  const { data } = useStore();
  const line = useMemo(() => {
    if (!data) return null;
    const link = data.arcs.find((a) => a.issue_id === issueId);
    if (!link) return null;
    const members = data.arcs.filter((a) => a.arc_id === link.arc_id).sort((a, b) => a.position - b.position);
    const part = members.findIndex((m) => m.issue_id === issueId) + 1;
    return { name: data.arcNames.get(link.arc_id) ?? "Arc", part, total: members.length };
  }, [data, issueId]);
  if (!line) return null;
  return <div className="kv"><span>ARC</span><span>{line.name} · Teil {line.part} von {line.total}</span></div>;
}

/**
 * "Bis #n alles gelesen" marks earlier issues as read; "Ab #n alles auf den Stapel"
 * puts this and later issues on the pile. Read and pile issues stay as they are.
 */
function RangeAction({ issue, mode, format }: { issue: Issue; mode: "read" | "pile"; format?: Format }) {
  const { data } = useStore();
  const { run, busy, error } = useRun();
  const [open, setOpen] = useState(false);
  const [todo, setTodo] = useState<{ ids: number[]; end: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const label = mode === "read" ? `Bis #${issue.number} alles gelesen` : `Ab #${issue.number} alles auf den Stapel`;

  async function prepare() {
    setOpen(true);
    setTodo(null);
    setFailed(null);
    try {
      const rows: { id: number; number: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const q = supabase.from("issues").select("id, number").eq("series_id", issue.series_id);
        const { data: d, error: e } = await (mode === "read" ? q.lte("sort_number", issue.sort_number!) : q.gte("sort_number", issue.sort_number!))
          .order("sort_number").range(from, from + 999);
        if (e) throw e;
        rows.push(...(d ?? []));
        if (!d || d.length < 1000) break;
      }
      const ids = rows.filter((r) => {
        const st = data?.userIssues.get(r.id)?.status;
        return st !== "pile" && st !== "expected" && st !== "read";
      }).map((r) => r.id);
      const end = mode === "read" ? rows[0]?.number : rows[rows.length - 1]?.number;
      setTodo({ ids, end: end ?? issue.number });
    } catch (e) {
      setFailed((e as { message?: string })?.message ?? String(e));
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn dashed" aria-expanded="false" onClick={prepare}>{label}</button>
    );
  }
  const count = todo ? (todo.ids.length === 1 ? "1 Heft" : `${todo.ids.length} Hefte`) : "";
  const span = todo ? (mode === "read" ? `#${todo.end} bis #${issue.number}` : `#${issue.number} bis #${todo.end}`) : "";
  return (
    <div className="confirm" role="group" aria-label={label} style={{ alignSelf: "stretch" }}>
      {failed ? <p>{failed}</p> : !todo ? <p>Zähle die Hefte …</p> : todo.ids.length === 0 ? (
        <p>{mode === "read" ? `Bis #${issue.number}` : `Ab #${issue.number}`} ist schon alles gelesen oder liegt auf dem Stapel.</p>
      ) : mode === "read" ? (
        <p>Trägt {span} als gelesen ein, {todo.ids.length === 1 ? "das ist" : "das sind"} {count} ohne Lesedatum. Hefte auf dem Stapel bleiben, wo sie sind.</p>
      ) : (
        <p>Legt {span} auf den Stapel, {todo.ids.length === 1 ? "das ist" : "das sind"} {count} als {format === "infinite" ? "Infinite" : "Print, noch nicht gekauft"}. Gelesene Hefte bleiben gelesen. Im Plan kommen sie nach deinem Altbestand dran.</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {todo && todo.ids.length > 0 && (
          <button type="button" className="btn hot" style={{ flex: 1 }} disabled={busy}
            onClick={() => run(async () => {
              await (mode === "read" ? actions.markReadUpTo(todo.ids) : actions.pileAll(todo.ids, format ?? "print"));
              setOpen(false);
            })}>
            {busy ? "Trage ein …" : mode === "read" ? `${count} eintragen` : `${count} auf den Stapel`}
          </button>
        )}
        <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>{todo && todo.ids.length > 0 ? "Abbrechen" : "Schließen"}</button>
      </div>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}
    </div>
  );
}
