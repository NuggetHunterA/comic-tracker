import { useLayoutEffect, useRef } from "react";
import { reducedMotion, wait } from "../lib/moments";

// A counter that turns over like a split-flap board at a train station: each
// changed character flips through the digits up to its new value, top half
// falling, bottom half swinging in. The characters are plain DOM the component
// manages itself; screen readers get the value once, as text.

const DIGITS = " 0123456789";

/** The cards a character passes on its way: digits run forward, anything else flips once. */
function steps(from: string, to: string): string[] {
  if (!DIGITS.includes(from) || !DIGITS.includes(to)) return [to];
  const out: string[] = [];
  let k = DIGITS.indexOf(from);
  const t = DIGITS.indexOf(to);
  while (k !== t && out.length < DIGITS.length) {
    k = (k + 1) % DIGITS.length;
    if (k === 0 && t !== 0) k = 1; // the blank card only shows on the way to a blank
    out.push(DIGITS[k]);
  }
  return out;
}

function setChars(el: HTMLElement, text: string) {
  el.textContent = "";
  for (const ch of text) {
    const c = document.createElement("span");
    c.className = "fc";
    c.textContent = ch;
    el.appendChild(c);
  }
}

const gen = new WeakMap<HTMLElement, number>();

async function flipOnce(c: HTMLElement, x: string, y: string, ms: number) {
  const h = c.offsetHeight;
  const half = (cls: string, ch: string) => {
    const s = document.createElement("span");
    s.className = `h ${cls}`;
    const i = document.createElement("span");
    i.textContent = ch;
    i.style.height = i.style.lineHeight = `${h}px`;
    s.appendChild(i);
    return s;
  };
  c.style.height = `${h}px`;
  c.textContent = "";
  const size = document.createElement("span");
  size.className = "sz";
  size.textContent = y;
  const leafTop = half("top leaf", x);
  const leafBot = half("bot leaf", y);
  leafBot.style.transform = "perspective(120px) rotateX(90deg)";
  c.append(size, half("top", y), half("bot", x), leafTop, leafBot);
  await leafTop.animate(
    [{ transform: "perspective(120px) rotateX(0deg)", filter: "brightness(1)" }, { transform: "perspective(120px) rotateX(-90deg)", filter: "brightness(0.7)" }],
    { duration: ms / 2, easing: "cubic-bezier(0.5, 0, 0.9, 0.5)", fill: "forwards" },
  ).finished;
  await leafBot.animate(
    [{ transform: "perspective(120px) rotateX(90deg)", filter: "brightness(0.7)" }, { transform: "perspective(120px) rotateX(0deg)", filter: "brightness(1)" }],
    { duration: ms / 2, easing: "cubic-bezier(0.1, 0.5, 0.3, 1)", fill: "forwards" },
  ).finished;
  c.textContent = y;
  c.style.height = "";
}

async function flapTo(el: HTMLElement, from: string, to: string, lag: number) {
  const me = (gen.get(el) ?? 0) + 1;
  gen.set(el, me);
  const n = Math.max(from.length, to.length);
  const a = from.padStart(n, " ");
  const b = to.padStart(n, " ");
  setChars(el, a);
  if (reducedMotion()) {
    setChars(el, to);
    el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180 });
    return;
  }
  const cells = Array.from(el.children) as HTMLElement[];
  await Promise.all(
    cells.map(async (c, i) => {
      if (a[i] === b[i]) return;
      const path = steps(a[i], b[i]);
      const per = path.length > 4 ? 64 : 120;
      await wait((n - 1 - i) * lag);
      let cur = a[i];
      for (const nx of path) {
        if (gen.get(el) !== me || !c.isConnected) return;
        await flipOnce(c, cur, nx, per).catch(() => undefined);
        cur = nx;
      }
    }),
  );
  // Leading blanks of a shorter number go once everything has landed.
  if (gen.get(el) === me) setChars(el, to);
}

interface Props {
  value: string;
  /** What was on the board before this mount, e.g. the value seen on the last visit. */
  from?: string;
  /** Before the first turn on mount, in ms. */
  delay?: number;
  className?: string;
}

export function Flap({ value, from, delay = 0, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shown.current === null) {
      const start = from ?? value;
      setChars(el, start);
      shown.current = start;
      if (start === value) return;
      shown.current = value;
      window.setTimeout(() => void flapTo(el, start, value, 50), delay);
      return;
    }
    if (shown.current === value) return;
    const old = shown.current;
    shown.current = value;
    void flapTo(el, old, value, 40);
  }, [value, from, delay]);

  return (
    <span className={`flapwrap ${className}`}>
      <span ref={ref} className="flap" aria-hidden="true" />
      <span className="sr-only">{value}</span>
    </span>
  );
}
