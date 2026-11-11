// The Archivkiste in the plan (lib/archive.ts): kraft envelopes with a tear
// strip. A thin week gets a flyer with three envelopes and hints, an empty
// evening one blind envelope for tonight, Halloween and Christmas a tinted one.
import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { archiveActions, nextEveningIndex } from "../lib/archive";
import { dropOut, reset, tearOpen, unpin } from "../lib/envelope";
import { flyToPile } from "../lib/motion";
import { runsLabel, seriesLong } from "../lib/labels";
import { defaultFormatOf, verlagOf } from "../lib/publisher";
import type { ArchiveSuggestion, Issue, Series } from "../lib/types";
import { Cover } from "./Cover";
import { useRun } from "./useRun";
import { ErrorNote } from "./ErrorNote";

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

interface Run {
  issues: { issue: Issue; series: Series | undefined }[];
  series: Series | undefined;
}

/** The envelope's issues and series, as far as they are loaded. */
function useRunOf() {
  const { data } = useStore();
  return (a: ArchiveSuggestion): Run | null => {
    if (!data) return null;
    const issues = a.issue_ids.map((id) => data.issues.get(id)).filter((i): i is Issue => !!i);
    if (!issues.length) return null;
    const series = data.series.get(issues[0].series_id);
    return { issues: issues.map((issue) => ({ issue, series })), series };
  };
}

const heftLabel = (n: number) => (n === 1 ? "1 HEFT" : `${n} HEFTE`);

function Envelope({ a, run, today, blind, big, tint, dim, onOpen }: {
  a: ArchiveSuggestion;
  run: Run;
  today: string;
  blind?: boolean;
  big?: boolean;
  tint?: "hw" | "xm";
  dim?: boolean;
  onOpen: (el: HTMLButtonElement) => void;
}) {
  const verlag = verlagOf(run.series);
  const n = a.issue_ids.length;
  const years = a.label_year ? Number(today.slice(0, 4)) - a.label_year : null;
  const stamp = a.kind === "anniversary" && years ? `DIESE WOCHE VOR ${years} JAHREN` : a.kind === "season" ? "SAISON" : null;
  const who = a.kind === "writer" || a.kind === "classic" ? a.label_writer : a.label_writer ?? run.series?.name;
  const label = blind ? "Überraschung aus dem Archiv" : `${a.label_year ?? ""}, ${who ?? ""}, ${heftLabel(n)}`;
  return (
    <button type="button" className={`env ${big ? "big" : ""} ${tint ?? ""} ${dim ? "dim" : ""}`} aria-label={`Umschlag aufreißen: ${label}`}
      onClick={(e) => onOpen(e.currentTarget)}>
      <span className="back" />
      <Cover issue={run.issues[0].issue} publisherMark={false} />
      <span className="front">
        <span className="fib" /><span className="face" />
        {(blind || tint) && <span className="seal">{blind ? "Reiß auf" : tint === "hw" ? "Halloween" : "X-Mas"}</span>}
      </span>
      <span className="strip"><span className="fib" /><span className="face" /><span className="perf" /><span className="zip" /><span className="tab" /></span>
      {blind ? (
        <span className="lbl"><span className="y">Aus dem Archiv</span><span className="w">Ein Heft für heute</span></span>
      ) : (
        <span className="lbl">
          {stamp && <span className="stk">{stamp}</span>}
          {a.label_year && <span className="y">{a.label_year}</span>}
          {who && <span className="w">{who}</span>}
          <span className="n">{heftLabel(n)}</span>
        </span>
      )}
      {verlag !== "other" && <span className={`pubdot ${verlag}`} />}
    </button>
  );
}

/** What came out of an envelope: the run, why, and what to do with it. */
function Found({ a, run, busy, onTake, onBack, onNever, backLabel = "Zurück in die Kiste" }: {
  a: ArchiveSuggestion;
  run: Run;
  busy: boolean;
  onTake: () => void;
  onBack: () => void;
  onNever?: () => void;
  backLabel?: string;
}) {
  const marvel = verlagOf(run.series) === "marvel";
  const meta = [a.title ?? seriesLong(run.series), a.label_year, a.kind === "writer" || a.kind === "classic" ? a.label_writer : null].filter(Boolean).join(" · ");
  return (
    <div className="in">
      <span className="ttl">{runsLabel(run.issues)}</span>
      <span className="meta">{meta}</span>
      {a.reason && <span className="why">{a.reason}</span>}
      {a.verified ? <span className="ok">{CHECK}AUF INFINITE GEFUNDEN</span> : marvel && <span className="ok mut">WEBTOON · NICHT GEPRÜFT</span>}
      <div className="act">
        <button type="button" className="btn hot" disabled={busy} onClick={onTake}>Auf den Stapel</button>
        <button type="button" className="btn" disabled={busy} onClick={onBack}>{backLabel}</button>
      </div>
      {marvel && onNever && <button type="button" className="linkbtn" disabled={busy} onClick={onNever}>Nicht im Abo, nie wieder vorschlagen</button>}
    </div>
  );
}

/** The flyer in a thin week: three envelopes with hints. */
export function ArchiveFlyer({ envelopes, free }: { envelopes: ArchiveSuggestion[]; free: number }) {
  const { data, today } = useStore();
  const runOf = useRunOf();
  const { run, retry, busy, error } = useRun();
  const [open, setOpen] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const els = useRef(new Map<number, HTMLButtonElement>());
  const flyer = useRef<HTMLElement>(null);
  const shown = envelopes.map((a) => ({ a, r: runOf(a) })).filter((x): x is { a: ArchiveSuggestion; r: Run } => !!x.r);
  if (!data || !shown.length) return null;
  const current = shown.find((x) => x.a.id === open) ?? null;

  const openEnvelope = async (a: ArchiveSuggestion, el: HTMLButtonElement) => {
    if (opening || busy || a.id === open) return;
    setOpening(true);
    const prev = open !== null ? els.current.get(open) : undefined;
    setOpen(null);
    if (prev) {
      await dropOut(prev);
      reset(prev);
      prev.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    }
    els.current.set(a.id, el);
    await tearOpen(el);
    setOpen(a.id);
    setOpening(false);
  };

  const decide = async (kind: "take" | "back" | "never") => {
    if (!current) return;
    const el = els.current.get(current.a.id);
    const cv = el?.querySelector<HTMLElement>(":scope > .cv");
    const last = shown.length === 1;
    setOpen(null);
    const ok = await run(async () => {
      if (kind === "take") {
        if (cv) void flyToPile(cv);
        await archiveActions.take(current.a, current.a.issue_ids, defaultFormatOf(current.r.series), data.userIssues);
      } else if (kind === "back") await archiveActions.putBack(current.a);
      else await archiveActions.never(current.a);
      if (el) await dropOut(el, kind !== "take");
      if (last && flyer.current) await unpin(flyer.current);
    });
    if (!ok && el) reset(el);
  };

  return (
    <section className="arch" aria-label="Aus dem Archiv" ref={flyer}>
      <span className="tape l" /><span className="tape r" />
      <h2>Aus dem Archiv</h2>
      <p className="sub"><b>{free}</b> der nächsten 7 Abende sind frei. Such dir einen Umschlag aus.</p>
      <div className="env-row">
        {shown.map(({ a, r }) => (
          <div key={a.id}>
            <Envelope a={a} run={r} today={today} dim={open !== null && open !== a.id}
              onOpen={(el) => { els.current.set(a.id, el); void openEnvelope(a, el); }} />
          </div>
        ))}
      </div>
      <div className={`found ${current ? "open" : ""}`}>
        <div>{current && (
          <Found a={current.a} run={current.r} busy={busy} onTake={() => void decide("take")} onBack={() => void decide("back")} onNever={() => void decide("never")} />
        )}</div>
      </div>
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </section>
  );
}

/** Halloween and Christmas: one tinted envelope; taken, the special goes on the next evening. */
export function SeasonFlyer({ envelope }: { envelope: ArchiveSuggestion }) {
  const { data, today, list, plan } = useStore();
  const runOf = useRunOf();
  const { run, retry, busy, error } = useRun();
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLButtonElement | null>(null);
  const flyer = useRef<HTMLElement>(null);
  const r = runOf(envelope);
  if (!data || !r || !envelope.season) return null;
  const hw = envelope.season === "hw";

  const decide = async (take: boolean) => {
    setOpen(false);
    const ok = await run(async () => {
      if (take) {
        const id = envelope.issue_ids[0];
        await archiveActions.take(envelope, [id], defaultFormatOf(r.series), data.userIssues);
        await archiveActions.place(list, id, nextEveningIndex(list, plan, today));
      } else await archiveActions.putBack(envelope);
      if (el.current) await dropOut(el.current, !take);
      if (flyer.current) await unpin(flyer.current);
    });
    if (!ok && el.current) reset(el.current);
  };

  return (
    <section className="arch season" aria-label={hw ? "Halloween" : "Weihnachten"} ref={flyer}>
      <span className="tape l" /><span className="tape r" />
      <div className="env-one">
        <div>
          <Envelope a={envelope} run={r} today={today} tint={envelope.season}
            onOpen={(b) => { if (open || busy) return; el.current = b; void tearOpen(b, 0.55).then(() => setOpen(true)); }} />
        </div>
        <div className="txt">
          <h2>{hw ? "Halloween" : "Weihnachten"}</h2>
          <p className="sub">Einmal im Jahr: ein Special aus dem Archiv. Bleibt bis zum {hw ? "31.10." : "26.12."} hier.</p>
        </div>
      </div>
      <div className={`found ${open ? "open" : ""}`}>
        <div>{open && <Found a={envelope} run={r} busy={busy} onTake={() => void decide(true)} onBack={() => void decide(false)} backLabel="Nicht dieses Jahr" />}</div>
      </div>
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </section>
  );
}

/** An empty evening: one blind envelope; its first issue becomes tonight's. */
export function BlindEnvelope({ envelope }: { envelope: ArchiveSuggestion }) {
  const { data, list } = useStore();
  const runOf = useRunOf();
  const { run, retry, busy, error } = useRun();
  const { today } = useStore();
  const r = runOf(envelope);
  if (!data || !r) return null;

  const open = async (el: HTMLButtonElement) => {
    if (busy || el.classList.contains("torn")) return;
    await tearOpen(el, 0.5);
    const id = envelope.issue_ids[0];
    const ok = await run(async () => {
      await archiveActions.take(envelope, [id], defaultFormatOf(r.series), data.userIssues);
      await archiveActions.place(list, id, 0);
      await dropOut(el, false);
    });
    if (!ok) reset(el);
  };

  return (
    <div className="blind">
      <Envelope a={envelope} run={r} today={today} blind big onOpen={(el) => void open(el)} />
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </div>
  );
}

/** Under tonight's archive issue: the rest of its run onto the pile. */
export function RestOfRun({ envelope, rest }: { envelope: ArchiveSuggestion; rest: number[] }) {
  const { data } = useStore();
  const runOf = useRunOf();
  const { run, retry, busy, error } = useRun();
  const r = runOf(envelope);
  if (!data || !r) return null;
  const restIssues = r.issues.filter((x) => rest.includes(x.issue.id));
  const label = restIssues.length ? runsLabel(restIssues).replace(`${r.series?.name ?? ""} `, "") : "";
  return (
    <div className="restrun">
      {envelope.title && <p className="lead"><strong>{envelope.title}</strong>{envelope.label_year ? `, ${envelope.label_year}` : ""}{envelope.label_writer ? `, ${envelope.label_writer}` : ""}. {envelope.reason}</p>}
      <button type="button" className="btn hot" disabled={busy}
        onClick={(e) => {
          const cv = e.currentTarget.closest(".pane")?.querySelector<HTMLElement>(".tonight .cv");
          void run(async () => {
            if (cv) void flyToPile(cv);
            await archiveActions.take(envelope, rest, defaultFormatOf(r.series), data.userIssues);
          });
        }}>
        Rest auf den Stapel: {label}
      </button>
      <ErrorNote error={error} onRetry={retry} busy={busy} />
    </div>
  );
}
