// The small rewards for reading: when the last read happened (so a stamp or a
// seal only plays right after it, never on opening the app), the event finale
// that the Feierabend stamp waits for, and what this device remembers between
// visits (which events carry a seal, what the Bilanz showed last time).

import { gradeLabel } from "./stats";

/** "3 HEFTE · Ø 8,3 · 5. ABEND IN FOLGE": the grade only with grades, the streak from the second evening. */
export function receipt(count: number, grades: number[], streak: number): string {
  const parts = [`${count} ${count === 1 ? "HEFT" : "HEFTE"}`];
  if (grades.length) parts.push(`Ø ${gradeLabel(grades.reduce((a, b) => a + b, 0) / grades.length)}`);
  if (streak > 1) parts.push(`${streak}. ABEND IN FOLGE`);
  return parts.join(" · ");
}

const JUST_NOW_MS = 12_000;
let lastRead = 0;

/** Called by the store on every "Gelesen". */
export const noteRead = () => {
  lastRead = Date.now();
};
export const readJustNow = () => Date.now() - lastRead < JUST_NOW_MS;

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
};

export const wait = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms));

/** A short jolt of the whole screen, as if something was pressed onto the wall. */
export function jolt() {
  const el = document.querySelector<HTMLElement>(".app");
  el?.animate([{ transform: "none" }, { transform: "translateY(3px)" }, { transform: "translateY(-1px)" }, { transform: "none" }], { duration: 200, easing: "ease-out" });
}

// ---------- Event finale: the stamp waits until the seal is on the wall ----------

let finale: Promise<void> | null = null;
let endFinale: (() => void) | null = null;

export function startFinale() {
  finale = new Promise((done) => {
    endFinale = done;
  });
}
export function finishFinale() {
  endFinale?.();
  finale = null;
  endFinale = null;
}
/** Resolves once no event finale is running. */
export const finaleDone = () => finale ?? Promise.resolve();

/** The stamp plays once per evening and device session. */
let stampedOn: string | null = null;
export const stampPlayed = (day: string) => stampedOn === day;
export const markStampPlayed = (day: string) => {
  stampedOn = day;
};

// ---------- Remembered on this device ----------

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the app works without it */
  }
}

const SEALS = "comics.seals";
/** Events that were read to the end once, with the number of issues they had then. */
export const loadSeals = (): Record<string, number> => load(SEALS, {});
export const saveSeals = (s: Record<string, number>) => save(SEALS, s);

const BILANZ = "comics.bilanz.seen";
export type BilanzSeen = Record<string, string>;
export const loadBilanzSeen = (): BilanzSeen | null => load<BilanzSeen | null>(BILANZ, null);
export const saveBilanzSeen = (s: BilanzSeen) => save(BILANZ, s);
