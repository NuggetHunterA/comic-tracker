// Small moments on the copier wall besides the rip (lib/rip.ts): an issue flying
// onto the pile, the Fehldruck block sliding between tabs. Like the rip, the
// flying copy is temporary DOM, so the screen underneath may re-render freely.

import { tapeOn } from "./rip";

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Something just done elsewhere whose moment plays when its view mounts (e.g. a series just followed). */
let fresh: { key: string; at: number } | null = null;
export const markFresh = (key: string) => {
  fresh = { key, at: Date.now() };
};
export const isFresh = (key: string) => !!fresh && fresh.key === key && Date.now() - fresh.at < 5000;

const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));

/**
 * Tapes the cover down once more and sends a small copy of it into the
 * Fehldruck bar onto "Stapel", whose counter jumps. Folded, the bar sits under
 * the detail sheet, so it slides up for the catch and back down after.
 */
export async function flyToPile(cv: HTMLElement) {
  const nav = document.querySelector<HTMLElement>(".nav");
  const item = nav?.querySelector<HTMLElement>('a[href="#stapel"]');
  const label = item?.querySelector<HTMLElement>(".l");
  tapeOn(cv);
  if (!nav || !label) return;

  const covered = !!cv.closest(".sheet");
  if (covered) {
    nav.classList.add("peek");
    nav.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 200, easing: EASE_OUT });
  }

  const from = cv.getBoundingClientRect();
  const w = cv.offsetWidth;
  const h = cv.offsetHeight;
  const copy = cv.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".tape, .stamp, .pinned").forEach((n) => n.remove());
  copy.classList.add("copy", "flying");
  Object.assign(copy.style, { width: `${w}px`, height: `${h}px`, left: `${from.left + from.width / 2 - w / 2}px`, top: `${from.top + from.height / 2 - h / 2}px` });
  document.body.appendChild(copy);

  // Measured after the bar has started to come up, where it will be at the catch.
  await wait(covered ? 200 : 0);
  const to = label.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = Math.min(0.3, to.height / h);
  const flight = copy.animate(
    [
      { transform: "rotate(-1.5deg)", opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${Math.min(dy * 0.2, 0) - 48}px) scale(0.62) rotate(-10deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(8deg)`, opacity: 0.25 },
    ],
    { duration: 560, delay: 140, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "both" },
  );
  await flight.finished.catch(() => undefined);
  copy.remove();

  label.animate([{ transform: "scale(1.14)" }, { transform: "none" }], { duration: 240, easing: EASE_OUT });
  item?.querySelector(".c")?.animate([{ transform: "translateY(-6px)", color: "var(--pink)" }, { transform: "none", color: "var(--pink)", offset: 0.6 }, { transform: "none" }], {
    duration: 520,
    easing: EASE_OUT,
  });

  if (covered) {
    await wait(520);
    const down = nav.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 160, easing: "ease-in", fill: "forwards" });
    await down.finished.catch(() => undefined);
    nav.classList.remove("peek");
    down.cancel();
  }
}

/** Presses a button in like a rubber stamp. */
export function pressStamp(el: HTMLElement) {
  el.animate(
    [
      { transform: "scale(1.4) rotate(-8deg)", boxShadow: "3px 6px 6px rgba(17,17,17,0.25)" },
      { transform: "scale(0.9)", boxShadow: "0 0 0 rgba(17,17,17,0)", offset: 0.55 },
      { transform: "none" },
    ],
    { duration: 240, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
  );
}

/** A short jolt of the cover when something lands on it. */
export function thud(el: HTMLElement | null | undefined, delay = 0) {
  el?.animate([{ translate: "0 0" }, { translate: "0 3px", offset: 0.4 }, { translate: "0 0" }], { duration: 160, delay });
}

/**
 * Slides the pink print block from the old tab to the new one. The paper
 * shadow under it follows a moment later, like a print slightly off register.
 */
export function slideTab(fromLabel: HTMLElement, toLabel: HTMLElement) {
  const o = fromLabel.getBoundingClientRect();
  const n = toLabel.getBoundingClientRect();
  if (!n.width || !n.height) return;
  const dx = o.left - n.left;
  const dy = o.top - n.top;
  const sx = o.width / n.width;
  const sy = o.height / n.height;
  const block = toLabel.querySelector<HTMLElement>(".pb");
  const shadow = toLabel.querySelector<HTMLElement>(".ps");
  block?.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: "none" }], { duration: 260, easing: EASE_OUT });
  if (shadow) {
    const m = new DOMMatrix(getComputedStyle(shadow).transform);
    shadow.animate([{ transform: `translate(${dx + m.e}px, ${dy + m.f}px) scale(${sx}, ${sy})` }, { transform: `translate(${m.e}px, ${m.f}px)` }], {
      duration: 340,
      delay: 60,
      easing: EASE_OUT,
      fill: "backwards",
    });
  }
}
