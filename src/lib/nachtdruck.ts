// Nachtdruck: from 21:00 to 06:00 the copier wall prints in negative. The first time
// the app is open in an evening, the copier lamp runs once over the screen and the
// night print lies behind it; every later opening that evening starts dark. At 06:00
// the app goes back to day without a pass.

const NIGHT_FROM = 21;
const NIGHT_TO = 6;
const KEY = "comics.nachtdruck";

/** True from 21:00 to 05:59. */
export const isNight = (d: Date) => d.getHours() >= NIGHT_FROM || d.getHours() < NIGHT_TO;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The evening a night belongs to: 01:30 on the 12th is still the evening of the 11th. */
export function eveningOf(d: Date): string {
  if (d.getHours() >= NIGHT_TO) return ymd(d);
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  return ymd(prev);
}

/** The next 21:00 or 06:00 after d. */
export function nextSwitch(d: Date): Date {
  const n = new Date(d);
  n.setSeconds(0, 0);
  const h = d.getHours();
  if (h < NIGHT_TO) n.setHours(NIGHT_TO, 0);
  else if (h < NIGHT_FROM) n.setHours(NIGHT_FROM, 0);
  else {
    n.setDate(n.getDate() + 1);
    n.setHours(NIGHT_TO, 0);
  }
  return n;
}

function playedFor(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function markPlayed(evening: string) {
  try {
    window.localStorage.setItem(KEY, evening);
  } catch {
    /* private mode: the pass may then play once more */
  }
}

const root = () => document.documentElement;
const isPrinted = () => root().dataset.print === "nacht";
const print = (night: boolean) => {
  if (night) root().dataset.print = "nacht";
  else delete root().dataset.print;
};

/**
 * Before the first render: dark straight away when tonight's pass has already
 * played, so a later opening never flashes the day print.
 */
export function applyInitialPrint() {
  const now = new Date();
  print(isNight(now) && playedFor() === eveningOf(now));
}

const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const LID = 170;
const RUN = 1150;

/**
 * The pass: the lid closes (the day print dims for a moment), then the lamp runs
 * top to bottom and the night print is revealed behind it. Built on a view
 * transition, so the real app swaps once and only its two snapshots move.
 * Reduced motion gets the plain cross-fade; no view transitions, a plain swap.
 */
async function pass() {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition) return print(true);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    doc.startViewTransition(() => print(true));
    return;
  }
  // Both prints in their own type: the day snapshot is taken from what is on screen now.
  await document.fonts?.ready;
  const lamp = document.createElement("div");
  lamp.className = "nd-lamp";
  lamp.setAttribute("aria-hidden", "true");
  // The lamp is only in the old state: captured as a still at the top edge, gone from the live page,
  // so nothing is left behind when the transition ends.
  root().classList.add("nd-pass");
  document.body.append(lamp);
  const vt = doc.startViewTransition(() => {
    lamp.remove();
    print(true);
  });
  try {
    await vt.ready;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const at = (pseudoElement: string) => ({ duration: RUN, delay: LID, easing: EASE, fill: "both" as const, pseudoElement });
    root().animate(
      [{ filter: "brightness(1)" }, { filter: "brightness(0.68)", offset: 0.4 }, { filter: "brightness(0.68)", offset: 0.6 }, { filter: "brightness(1)" }],
      { duration: LID + 360, easing: "ease-out", pseudoElement: "::view-transition-old(root)" },
    );
    root().animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)" }], at("::view-transition-new(root)"));
    root().animate(
      [{ transform: `translate(${-0.05 * w}px, -30px)` }, { transform: `translate(${-0.05 * w}px, ${h + 4}px)` }],
      at("::view-transition-group(nd-lamp)"),
    );
    root().animate([{ opacity: 0 }, { opacity: 1 }], { duration: LID, easing: "ease-out", fill: "backwards", pseudoElement: "::view-transition-old(nd-lamp)" });
    await vt.finished;
  } catch {
    /* skipped (tab hidden, another transition): the print is already swapped */
  } finally {
    lamp.remove();
    root().classList.remove("nd-pass");
  }
}

let timer = 0;
let running = false;

async function check() {
  if (running) return;
  const now = new Date();
  const night = isNight(now);
  if (night && !isPrinted()) {
    const evening = eveningOf(now);
    if (playedFor() === evening || document.visibilityState !== "visible") {
      if (playedFor() === evening) print(true);
      // Hidden: wait for the app to come back, so the pass is seen.
    } else {
      running = true;
      markPlayed(evening);
      await pass();
      running = false;
    }
  } else if (!night && isPrinted()) {
    print(false);
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void check(), Math.max(1000, nextSwitch(now).getTime() - Date.now() + 500));
}

/** Once the app shows its data: play tonight's pass if due, then follow the clock. */
export function startNachtdruck(): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };
  document.addEventListener("visibilitychange", onVisible);
  void check();
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.clearTimeout(timer);
  };
}
