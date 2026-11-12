import { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { askClaude, pileLines, type AnsageAnswer } from "../lib/ansage";
import { speechSupported, useSpeech } from "../lib/speech";
import { dateLabel } from "../lib/dates";
import { issueTitle } from "../lib/labels";
import { report } from "../lib/errors";
import { offerAnsageUndo } from "../lib/ansageUndo";
import { Cover } from "./Cover";
import { HandIcon } from "./HandIcon";
import { ErrorNote } from "./ErrorNote";

const EXAMPLES = ["Alle Absolute Green Arrow als Nächstes", "Heute ist mir nach Marvel"];
/** How many evenings the preview shows; the rest of the plan follows as before. */
const PREVIEW_EVENINGS = 3;

type Step =
  | { at: "ask" }
  | { at: "think"; text: string }
  | { at: "show"; text: string; answer: AnsageAnswer }
  | { at: "fail"; text: string; error: string };

const MIC = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
  </svg>
);

/**
 * Ansage: say (or type) what to read next. Claude picks the issues, the sheet
 * shows the evenings that would follow, "Übernehmen" puts them on top.
 */
export function Ansage({ onDone }: { onDone: () => void }) {
  const { data, items, list, eventOf, today, previewUp, pullUp, offline } = useStore();
  const [step, setStep] = useState<Step>({ at: "ask" });
  const [typing, setTyping] = useState(!speechSupported());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const ask = async (text: string) => {
    setStep({ at: "think", text });
    try {
      const answer = await askClaude(text, pileLines(list, items, eventOf, today), today, data?.settings.max_per_evening ?? 3);
      setStep({ at: "show", text, answer });
    } catch (e) {
      setStep({ at: "fail", text, error: report(e) });
    }
  };
  const speech = useSpeech((said) => void ask(said));
  const again = () => {
    setApplyError(null);
    setStep({ at: "ask" });
  };

  const apply = async (answer: AnsageAnswer) => {
    setBusy(true);
    setApplyError(null);
    try {
      const before = await pullUp(answer.issueIds);
      const n = answer.issueIds.length;
      offerAnsageUndo({ text: `${n === 1 ? "1 Heft" : `${n} Hefte`} nach oben gelegt`, before });
      onDone();
    } catch (e) {
      setApplyError(report(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ansage">
      <h2 className="ansage-h">Ansage</h2>

      {step.at === "ask" && (
        <>
          <p className={`said ${speech.text ? "" : "hush"}`} aria-live="polite">
            {speech.text || (speech.listening ? "Ich höre …" : "Sag, was du als Nächstes lesen willst.")}
            {speech.listening && <span className="caret" aria-hidden="true" />}
          </p>
          {speech.listening && <span className="laser" aria-hidden="true" />}
          <ErrorNote error={speech.error} />
          {offline && <p className="mut" style={{ margin: 0 }}>Ohne Netz kann Claude nicht sortieren. Versuch es, sobald du wieder online bist.</p>}

          {typing ? (
            <form className="ansage-type" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void ask(draft.trim()); }}>
              <input ref={input} type="text" value={draft} onChange={(e) => setDraft(e.target.value)} enterKeyHint="send"
                placeholder="z. B. heute nur Batman" aria-label="Dein Wunsch" disabled={!!offline} />
              <button type="submit" className="btn solid" disabled={!draft.trim() || !!offline}>Los</button>
            </form>
          ) : (
            <button type="button" className={`mic ${speech.listening ? "on" : ""}`} disabled={!!offline}
              onClick={() => (speech.listening ? speech.stop() : speech.listen())}>
              <span className="mic-pb" aria-hidden="true" />
              {MIC}
              <span>{speech.listening ? "Fertig" : "Sprechen"}</span>
            </button>
          )}

          {!speech.listening && (
            <>
              <div className="ansage-ex" role="group" aria-label="Beispiele">
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" className="ex" disabled={!!offline} onClick={() => void ask(x)}>„{x}“</button>
                ))}
              </div>
              {speechSupported() && (
                <button type="button" className="linkbtn" onClick={() => { setTyping(!typing); setTimeout(() => input.current?.focus(), 0); }}>
                  {typing ? "Lieber sprechen" : "Lieber tippen"}
                </button>
              )}
            </>
          )}
        </>
      )}

      {step.at === "think" && (
        <>
          <p className="said quoted">„{step.text}“</p>
          <div className="loading" role="status">
            <span className="d" style={{ fontSize: 13 }}>CLAUDE SUCHT IM STAPEL …</span>
            <span className="bar"><i /></span>
          </div>
        </>
      )}

      {step.at === "fail" && (
        <>
          <p className="said quoted">„{step.text}“</p>
          <ErrorNote error={step.error} onRetry={() => void ask(step.text)} />
          <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={again}>Anders sagen</button>
        </>
      )}

      {step.at === "show" && (
        <Preview text={step.text} answer={step.answer} previewUp={previewUp} busy={busy} error={applyError}
          onApply={() => void apply(step.answer)} onAgain={again} onCancel={onDone} />
      )}
    </div>
  );
}

function Preview({ text, answer, previewUp, busy, error, onApply, onAgain, onCancel }: {
  text: string;
  answer: AnsageAnswer;
  previewUp: (ids: number[]) => ReturnType<ReturnType<typeof useStore>["previewUp"]>;
  busy: boolean;
  error: string | null;
  onApply: () => void;
  onAgain: () => void;
  onCancel: () => void;
}) {
  const { items, today } = useStore();
  const byId = useMemo(() => new Map(items.map((i) => [i.issue.id, i])), [items]);
  const up = new Set(answer.issueIds);
  const evenings = useMemo(() => previewUp(answer.issueIds).slice(0, PREVIEW_EVENINGS), [previewUp, answer.issueIds]);
  const n = answer.issueIds.length;

  return (
    <>
      <p className="said quoted small">„{text}“</p>
      <p className="reply">{answer.reply}</p>
      {n > 0 && (
        <>
          <div className="up-head">
            <span className="stk">{n === 1 ? "1 HEFT" : `${n} HEFTE`} NACH OBEN</span>
            <span className="d mut" style={{ fontSize: 13 }}>SO LIEST DU DANN</span>
          </div>
          <ol className="pv" aria-label="Die nächsten Abende danach">
            {evenings.map((ev) => (
              <li key={ev.date}>
                <span className="d pv-day">{ev.date === today ? <span className="stk">HEUTE</span> : dateLabel(ev.date, today).toUpperCase()}</span>
                <span className="pv-row">
                  {ev.entries.length === 0 && <span className="mut" style={{ fontSize: 14 }}>Nichts lesbar</span>}
                  {ev.entries.map((x) => {
                    const it = byId.get(x.issueId);
                    if (!it) return null;
                    const mine = up.has(x.issueId);
                    return (
                      <span key={x.issueId} className={`pv-cv ${mine ? "up" : ""}`} title={issueTitle(it.issue, it.series)}>
                        <Cover issue={it.issue} readable={it.readable} />
                        {mine && <span className="pv-hand" aria-label="nach oben gelegt"><HandIcon size={13} /></span>}
                        <span className="sr-only">{issueTitle(it.issue, it.series)}{mine ? ", nach oben gelegt" : ""}</span>
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ol>
          <p className="d mut" style={{ fontSize: 12, margin: 0 }}>Danach geht es weiter wie bisher. Die Hand heißt: bleibt oben, bis du es liest.</p>
        </>
      )}
      <ErrorNote error={error} onRetry={onApply} busy={busy} />
      <div className="ansage-act">
        {n > 0 && <button type="button" className="btn hot big" onClick={onApply} disabled={busy}>{busy ? "Moment …" : "Übernehmen"}</button>}
        <button type="button" className="btn" onClick={onAgain} disabled={busy}>{n > 0 ? "Anders sagen" : "Nochmal ansagen"}</button>
        {n > 0 && <button type="button" className="linkbtn" onClick={onCancel} disabled={busy}>Verwerfen</button>}
      </div>
    </>
  );
}
