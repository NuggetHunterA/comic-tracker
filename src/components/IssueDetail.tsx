import { useEffect, useRef, useState } from "react";
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
import { flyToPile, pressStamp, thud } from "../lib/motion";
import { useInfiniteHref } from "../lib/infiniteLink";
import { EVENT_COLORS, defaultShort, eventHex } from "../lib/events";
import { openEvent } from "../lib/nav";


type Props = { issueId: number; onClose?: () => void; fromRun?: boolean };

/** A fresh detail per issue, so a moment just played for one issue does not replay on the next. */
export function IssueDetail(props: Props) {
  return <IssueDetailBody key={props.issueId} {...props} />;
}

const ICON = {
  check: <path d="M4 12.5l5 5L20 6.5" />,
  out: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  next: <path d="M4 12h14M13 6l6 6-6 6" />,
  tonight: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3" />,
  pin: <><circle cx="12" cy="8" r="4" /><path d="M12 12v9" /></>,
  pile: <path d="M4 8h16M4 13h16M4 18h16" />,
  dots: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
type Slot = { icon: keyof typeof ICON; label: string; title: string; onClick?: () => void; href?: string };
type More = { label: string; onClick: () => void; warn?: boolean };

function Icon({ name }: { name: keyof typeof ICON }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">{ICON[name]}</svg>;
}

// On a desktop there is room to show everything under Mehr at once.
const DESK = "(min-width: 1300px)";
function useDesk() {
  const [desk, setDesk] = useState(() => window.matchMedia(DESK).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESK);
    const on = () => setDesk(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

function IssueDetailBody({ issueId, onClose, fromRun }: Props) {
  const { data, today, plan } = useStore();
  const { run, busy, error } = useRun();
  const [pickFormat, setPickFormat] = useState<Format>("infinite");
  const [moreOpen, setMoreOpen] = useState(false);
  const desk = useDesk();
  const showMore = moreOpen || desk;
  const head = useRef<HTMLDivElement>(null);
  // What was just done here, so only that plays its moment (not every time the detail opens).
  const [stamped, setStamped] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [justFollowed, setJustFollowed] = useState(false);
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
  const cover = () => head.current?.querySelector<HTMLElement>(".cv");
  const toPile = () => {
    const cv = cover();
    if (cv) void flyToPile(cv);
    return run(() => actions.addIssue(issueId, "pile", isDC ? pickFormat : "print"));
  };
  const markRead = async () => {
    // Tear the cover off, then tape it back on marked as read.
    const cv = cover();
    const rip = cv ? ripCover(cv) : null;
    await run(() => Promise.all([actions.markRead(issueId, today), new Promise((done) => window.setTimeout(done, RIP_MS))]));
    rip?.restore();
  };
  const readEarlier = () => run(() => actions.markReadEarlier(issueId));
  const toWishlist = () => { setPinned(true); run(() => actions.addIssue(issueId, "wishlist", null)); };
  const follow = async () => { if (await run(() => actions.follow(issue.series_id, isDC ? "infinite" : "print"))) setJustFollowed(true); };

  // The toner bar: one pink main action, up to two slots, then Mehr. Everything else waits under Mehr.
  const fresh = !ui || ui.status === "dismissed";
  const picking = fresh || ui?.status === "wishlist";
  const hasRange = issue.sort_number !== null && (picking || ui?.status === "read");
  let go: { label: string; onClick: () => void } | null = null;
  let wait: string | null = null;
  const cand: Slot[] = [];
  const more: More[] = [];
  if (fresh) {
    // In a series' run, an issue that is already out was most likely read long ago.
    const oldInRun = !!fromRun && !!issue.store_date && issue.store_date <= today;
    go = oldInRun ? { label: "Schon gelesen", onClick: readEarlier } : { label: "Einplanen", onClick: toPile };
    cand.push(oldInRun ? { icon: "pile", label: "Einplanen", title: "Einplanen", onClick: toPile } : { icon: "check", label: "Gelesen", title: "Schon gelesen", onClick: readEarlier });
    cand.push({ icon: "pin", label: "Wunsch", title: "Auf die Wunschliste", onClick: toWishlist });
    if (!followed) more.push({ label: "Serie folgen", onClick: follow });
  } else if (ui.status === "wishlist") {
    go = { label: "Auf den Stapel", onClick: toPile };
    cand.push({ icon: "check", label: "Gelesen", title: "Schon gelesen", onClick: readEarlier });
    cand.push({ icon: "x", label: "Streichen", title: "Von der Liste", onClick: () => run(async () => { await actions.dismissIssue(issueId); onClose?.(); }) });
  } else if (ui.status !== "read") {
    if (readable) go = { label: "Gelesen", onClick: markRead };
    else if (ui.format !== "infinite" && !ui.bought_on) go = { label: "Gekauft", onClick: () => run(() => actions.setBought(issueId, today)) };
    else if (from) wait = `AB ${shortDate(from)}`;
    if (ui.format === "infinite" && readable) cand.push({ icon: "out", label: "Infinite", title: "In Infinite öffnen", href: infiniteHref });
    if (readable && !ui.skip_plan) {
      const tomorrow = { icon: "next" as const, label: "Morgen", title: "Auf morgen", onClick: () => run(() => actions.pin(issueId, addDays(today, 1), 1)) };
      if (isTonight(plan, today, issueId)) cand.push(tomorrow);
      else {
        cand.push({ icon: "tonight", label: "Heute", title: "Heute lesen", onClick: () => run(() => actions.pin(issueId, today, 1)) });
        more.push({ label: "Auf morgen", onClick: tomorrow.onClick! });
      }
    }
    cand.push(ui.skip_plan
      ? { icon: "back", label: "Einplanen", title: "Wieder einplanen", onClick: () => run(() => actions.skipPlan(issueId, false)) }
      : { icon: "x", label: "Aus Plan", title: "Aus dem Plan", onClick: () => run(() => actions.skipPlan(issueId, true)) });
  }
  const slots = cand.slice(0, 2);
  // What does not fit in the bar goes first under Mehr.
  more.unshift(...cand.slice(2).map((c) => ({ label: c.title, onClick: c.onClick! })));
  if (ui?.status === "read") more.push({ label: "Doch nicht gelesen", warn: true, onClick: () => run(() => (!ui.format && !ui.read_on ? actions.removeIssue(issueId) : actions.markUnread(issueId))) });
  const onPile = !!ui && ui.status !== "read" && ui.status !== "dismissed" && ui.status !== "wishlist";
  if (onPile && ui.format !== "infinite" && ui.bought_on) more.push({ label: "Doch nicht gekauft", onClick: () => run(() => actions.setBought(issueId, null)) });
  if (onPile) more.push({ label: "Vom Stapel entfernen", warn: true, onClick: () => run(async () => { await actions.removeIssue(issueId); onClose?.(); }) });
  // Undoing and removing come last, after the everyday changes.
  const moreRow = (m: More) => (
    <button key={m.label} type="button" className={`mrow ${m.warn ? "warn" : ""}`} disabled={busy} onClick={m.onClick}><span>{m.label}</span><Chevron /></button>
  );
  const moreCount = more.length + (hasRange ? 2 : 0) + (onPile && isDC ? 1 : 0) + (onPile || ui?.status === "wishlist" ? 1 : 0);

  return (
    <div className="issue-detail">
      <div ref={head} className="dhead">
        <Cover issue={issue} readable={!ui || readable || ui.status === "read"} showNumber={false} tape={ui?.status === "read" ? "GELESEN" : true} style={{ width: "var(--detail-cover, 96px)", flex: "none", transform: "rotate(-1.5deg)" }}>
          {ui?.status === "read" && ui.rating && <span key={ui.rating} className={`stamp grade ${stamped === ui.rating ? "hit" : ""}`}>{ui.rating}<b>/10</b></span>}
          {ui?.status === "wishlist" && <span className={`pinned ${pinned ? "swing" : ""}`}><span className="pin" /><span className="lbl">WUNSCH</span></span>}
        </Cover>
        <div className="dmeta">
          <h2>{justFollowed && followed ? <span className="marker fresh">{title}</span> : title}</h2>
          <div className="facts">
            {issue.store_date && (
              <div className="kv"><span>ERSCHEINT</span><span>{dateLabel(issue.store_date, today)}</span></div>
            )}
            {isDC && issue.store_date && (!ui || ui.format === "infinite") && (
              <div className="kv"><span>INFINITE</span>{addDays(issue.store_date, delay) <= today ? <span>Verfügbar</span> : <span><span className="stk">AB {shortDate(addDays(issue.store_date, delay))}</span></span>}</div>
            )}
            {ui && ui.format && (
              <div className="kv"><span>FORMAT</span><span>{FORMAT_LABEL[ui.format]}{ui.old_pile ? " · Altbestand" : ""}{ui.format !== "infinite" ? (ui.bought_on ? ` · gekauft ${shortDate(ui.bought_on)}` : " · noch nicht gekauft") : ""}</span></div>
            )}
            <EventLine issueId={issueId} />
            {ui && <PlanLine issueId={issueId} plan={plan} today={today} />}
            {ui?.status === "read" && ui.read_on && <div className="kv"><span>GELESEN</span><span>{dayLabel(ui.read_on)}</span></div>}
          </div>
        </div>
      </div>

      {picking && isDC && (
        <div className="readas"><span>LESEN ALS</span><FormatChips value={pickFormat} onChange={setPickFormat} /></div>
      )}

      {ui?.status === "read" && !desk && (
        <button type="button" className="morehead" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
          <span>Mehr</span><span className="n">{moreCount}</span><Chevron open={moreOpen} />
        </button>
      )}

      {showMore && moreCount > 0 && (
        <div className="morelist" role="group" aria-label="Mehr">
          {more.filter((m) => !m.warn).map(moreRow)}
          {onPile && isDC && (
            <div className="mrow"><span>Format</span><FormatChips value={ui.format ?? "print"} onChange={(f) => run(() => actions.setFormat(issueId, f))} /></div>
          )}
          {(onPile || ui?.status === "wishlist") && <div className="mrow pick"><EventPick issue={issue} isDC={isDC} /></div>}
          {hasRange && (
            <>
              <RangeAction issue={issue} mode="read" />
              <RangeAction issue={issue} mode="pile" format={followedFormat ?? (isDC ? "infinite" : "print")} />
            </>
          )}
          {more.filter((m) => m.warn).map(moreRow)}
        </div>
      )}

      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>{error}</p>}

      {ui?.status === "read" ? (
        <div role="radiogroup" aria-label="Bewertung von 1 bis 10" className="toner rate">
          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={ui.rating === n} className={ui.rating === n ? "on" : ""} disabled={busy}
              onClick={(e) => {
                if (ui.rating !== n) {
                  pressStamp(e.currentTarget);
                  setStamped(n);
                  thud(cover(), 230);
                }
                run(() => actions.rate(issueId, ui.rating === n ? null : n));
              }}>{n}</button>
          ))}
        </div>
      ) : (
        <div className="toner">
          {go ? <button type="button" className="go" disabled={busy} onClick={go.onClick}>{go.label}</button>
            : wait ? <span className="go wait">{wait}</span> : null}
          {slots.map((sl) => sl.href ? (
            <a key={sl.label} className="slot" href={sl.href} title={sl.title} target={sl.href.startsWith("intent:") ? undefined : "_blank"} rel="noreferrer"><Icon name={sl.icon} />{sl.label}</a>
          ) : (
            <button key={sl.label} type="button" className="slot" title={sl.title} disabled={busy} onClick={sl.onClick}><Icon name={sl.icon} />{sl.label}</button>
          ))}
          {moreCount > 0 && !desk && (
            <button type="button" className={`slot ${moreOpen ? "on" : ""}`} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><Icon name="dots" />Mehr</button>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d={open === undefined ? "M9 5l7 7-7 7" : open ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"} />
    </svg>
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

function EventLine({ issueId }: { issueId: number }) {
  const { eventOf } = useStore();
  const mark = eventOf.get(issueId);
  if (!mark) return null;
  return (
    <div className="kv">
      <span>EVENT</span>
      <button type="button" className="evlink" onClick={() => openEvent(mark.event.id)}>
        <span className="evdot" style={{ background: eventHex(mark.event.color) }} aria-hidden="true" />
        {mark.event.name} · Teil {mark.part} von {mark.total} <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

/** "Zu Event hinzufügen": the events to pick from, or a new one. */
function EventPick({ issue, isDC }: { issue: Issue; isDC: boolean }) {
  const { data, events, eventOf } = useStore();
  const { run, busy } = useRun();
  const current = eventOf.get(issue.id)?.event.id;
  const [newName, setNewName] = useState("");
  if (!data) return null;
  const ui = data.userIssues.get(issue.id);
  const format: Format = ui?.format ?? (isDC ? "infinite" : "print");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{current ? "Event" : "Zu Event hinzufügen"}</span>
      <div className="chips">
        {events.map((v) => (
          <button key={v.event.id} type="button" className={`chip ${current === v.event.id ? "on" : ""}`} aria-pressed={current === v.event.id} disabled={busy}
            onClick={() => run(() => (current === v.event.id ? actions.removeFromEvent(issue.id) : actions.addToEvent(v, issue, ui, format)))}>
            <span className="evdot" style={{ background: eventHex(v.event.color) }} aria-hidden="true" />{v.event.name}
          </button>
        ))}
      </div>
      <form className="jump" onSubmit={(e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        run(async () => {
          const id = await actions.createEvent(name, defaultShort(name), EVENT_COLORS[events.length % EVENT_COLORS.length].id);
          await actions.addToEvent({ event: { id, name, short: defaultShort(name), color: "", manual_order: false, created_at: "" }, order: [], read: 0 }, issue, ui, format);
          setNewName("");
        });
      }}>
        <label className="sr-only" htmlFor={`newev-${issue.id}`}>Neues Event</label>
        <input id={`newev-${issue.id}`} type="text" placeholder="Neues Event, z. B. DC K.O." value={newName} onChange={(e) => setNewName(e.target.value)} autoComplete="off" style={{ width: "auto", flex: 1 }} />
        <button type="submit" className="btn" disabled={busy || !newName.trim()}>Anlegen</button>
      </form>
    </div>
  );
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
      <button type="button" className="mrow" aria-expanded="false" onClick={prepare}><span>{label}</span><Chevron /></button>
    );
  }
  const count = todo ? (todo.ids.length === 1 ? "1 Heft" : `${todo.ids.length} Hefte`) : "";
  const span = todo ? (mode === "read" ? `#${todo.end} bis #${issue.number}` : `#${issue.number} bis #${todo.end}`) : "";
  return (
    <div className="confirm" role="group" aria-label={label}>
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
