import { useLayoutEffect, useRef } from "react";
import { fromIso } from "../lib/dates";
import { buzz, finaleDone, jolt, markStampPlayed, readJustNow, receipt, reducedMotion, stampPlayed, wait } from "../lib/moments";

const DAYS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];

/** "MI · 11.11.2026" */
function stampDate(iso: string) {
  const d = fromIso(iso);
  return `${DAYS[d.getDay()]} · ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Waits until no detail sheet covers the plan, so the stamp is seen. */
function uncovered(): Promise<void> {
  if (!document.querySelector(".sheet")) return Promise.resolve();
  return new Promise((done) => {
    const mo = new MutationObserver(() => {
      if (!document.querySelector(".sheet")) {
        mo.disconnect();
        done();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

interface Props {
  today: string;
  count: number;
  grades: number[];
  streak: number;
  next: { label: string; onClick: () => void } | null;
}

/**
 * Tonight read to the end: FEIERABEND is pressed onto the empty wall, with the
 * evening's tally typed under it. The press plays once, right after the last
 * "Gelesen"; afterwards the stamp just stands there until midnight.
 */
export function Feierabend({ today, count, grades, streak, next }: Props) {
  const stamp = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const text = receipt(count, grades, streak);

  useLayoutEffect(() => {
    const st = stamp.current;
    const ln = line.current;
    if (!st || !ln || stampPlayed(today) || !readJustNow()) return;
    markStampPlayed(today);
    st.style.visibility = ln.style.visibility = "hidden";
    void (async () => {
      // An event finale goes first; a detail sheet over the plan has to close.
      await wait(60);
      await finaleDone();
      await uncovered();
      st.style.visibility = ln.style.visibility = "";
      if (reducedMotion()) {
        st.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
        ln.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, fill: "backwards" });
        buzz(30);
        return;
      }
      ln.style.visibility = "hidden";
      // Dropped in fast, a little squashed on impact, then the wall jolts.
      const press = st.animate([
        { transform: "translate(14px, -34px) rotate(-14deg) scale(1.5)", opacity: 0, filter: "blur(3px) drop-shadow(8px 22px 14px rgba(17,17,17,0.35))" },
        { transform: "translate(4px, -10px) rotate(-9deg) scale(1.15)", opacity: 0.9, filter: "blur(0.6px) drop-shadow(4px 10px 8px rgba(17,17,17,0.3))", offset: 0.6, easing: "cubic-bezier(0.6, 0, 0.9, 0.6)" },
        { transform: "rotate(-6deg) scale(0.95, 0.93)", opacity: 1, filter: "blur(0) drop-shadow(0 0 0 rgba(17,17,17,0))", offset: 0.82 },
        { transform: "rotate(-6deg) scale(1)", opacity: 1, filter: "none" },
      ], { duration: 460, easing: "cubic-bezier(0.55, 0, 0.85, 0.4)" });
      window.setTimeout(() => {
        buzz(30);
        jolt();
      }, 460 * 0.82);
      await press.finished.catch(() => undefined);
      // The rubber lifting off leaves a faint second print for a moment.
      const echo = st.cloneNode(true) as HTMLElement;
      echo.classList.add("echo");
      st.parentElement?.appendChild(echo);
      echo.animate([{ opacity: 0.35, transform: "rotate(-6deg)" }, { opacity: 0, transform: "rotate(-5.4deg) translate(2px, 1px)" }], { duration: 520, easing: "ease-out" })
        .finished.finally(() => echo.remove());
      await wait(140);
      // The tally types itself out like a till receipt.
      ln.style.visibility = "";
      const n = ln.textContent?.length ?? 20;
      ln.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: n * 26, easing: `steps(${n}, end)` });
    })();
    // Not cancelled on cleanup: the stamp's DOM outlives React's double effect run in development.
  }, [today]);

  return (
    <div className="feierabend">
      <div className="fa-wrap">
        <div className="fa-stamp" ref={stamp} role="img" aria-label={`Feierabend, ${stampDate(today)}`}>
          <span className="w">Feierabend</span>
          <span className="dt">{stampDate(today)}</span>
        </div>
      </div>
      <div className="fa-receipt d" ref={line}>{text}</div>
      {next && <button type="button" className="btn" onClick={next.onClick}>Noch eins: {next.label}</button>}
    </div>
  );
}
