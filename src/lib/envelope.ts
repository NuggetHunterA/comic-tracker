// Tearing open an Archivkiste envelope: a press, the pink tear strip runs, the
// flap flies off, the cover slides up out of the envelope. The torn edge is
// different every time. Like the rip (rip.ts) everything works on the DOM the
// component drew; reset() puts the envelope back when a write fails.

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
const r = (a: number, b: number) => a + Math.random() * (b - a);
const anim = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) =>
  el.animate(kf, { fill: "forwards", ...o }).finished.catch(() => undefined);

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
};

/** A jagged line across the envelope, heights 0..1. */
function edge(): [number, number][] {
  const pts: [number, number][] = [];
  let y = 0.5;
  for (let i = 0; i <= 16; i++) {
    y = Math.max(0, Math.min(1, (y + r(-0.22, 0.22)) * 0.7 + 0.15));
    pts.push([(100 * i) / 16, y]);
  }
  return pts;
}

/** Cuts the torn edge into the flap's bottom and the body's top, a strip of white fibre between. */
function shapeTear(env: HTMLElement) {
  const front = env.querySelector<HTMLElement>(".front");
  const strip = env.querySelector<HTMLElement>(".strip");
  if (!front || !strip) return;
  const amp = 7;
  front.style.top = `calc(15% - ${amp}px)`;
  const fh = front.offsetHeight;
  const sh = strip.offsetHeight;
  const e = edge();
  const top = (dy: number) => e.map(([x, y]) => `${x}% ${((y * amp + dy) / fh) * 100}%`);
  const bottom = (dy: number) => e.map(([x, y]) => `${x}% ${100 + ((y * amp - amp + dy) / sh) * 100}%`).reverse();
  const set = (el: Element | null, pts: string[], tail: string[]) => {
    if (el instanceof HTMLElement) el.style.clipPath = `polygon(${[...pts, ...tail].join(",")})`;
  };
  set(front.querySelector(".face"), top(2.5), ["100% 100%", "0 100%"]);
  set(front.querySelector(".fib"), top(0), ["100% 100%", "0 100%"]);
  set(strip.querySelector(".face"), ["0 0", "100% 0", ...bottom(-2.5)], []);
  set(strip.querySelector(".fib"), ["0 0", "100% 0", ...bottom(0)], []);
}

/** Makes room above the row so the cover coming out covers nothing. */
function room(env: HTMLElement, px: number) {
  const box = env.closest<HTMLElement>(".env-row, .env-one");
  if (box) box.style.paddingTop = px ? `${Math.round(px)}px` : "";
}

/** Tears the envelope open; the cover ends `rise` of its height out of the top. */
export async function tearOpen(env: HTMLElement, rise = 0.58) {
  const strip = env.querySelector<HTMLElement>(".strip");
  const zip = env.querySelector<HTMLElement>(".zip");
  const cv = env.querySelector<HTMLElement>(":scope > .cv");
  const lbl = env.querySelector<HTMLElement>(".lbl");
  if (!strip || !zip || !cv || !lbl) return;
  env.classList.add("torn");
  if (reduced()) {
    await Promise.all([anim(strip, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }), anim(lbl, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 })]);
    room(env, cv.offsetHeight * rise + 4);
    await anim(cv, [{ transform: `translateY(-${rise * 100}%)`, opacity: 0.3 }, { transform: `translateY(-${rise * 100}%)`, opacity: 1 }], { duration: 200 });
    return;
  }
  shapeTear(env);
  env.animate([{ transform: "scale(1)" }, { transform: "scale(0.965)" }, { transform: "scale(1)" }], { duration: 160, easing: "ease-out" });
  await anim(zip, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 220, delay: 60, easing: "cubic-bezier(0.5, 0, 0.75, 0)" });
  buzz(12);
  void anim(lbl, [{ transform: "rotate(-1.5deg)" }, { transform: "translateY(26px) rotate(3deg)", opacity: 0 }], { duration: 300, easing: "ease-in" });
  void anim(strip, [
    { transform: "none", opacity: 1 },
    { transform: "translate(4px, -6px) rotate(-8deg)", opacity: 1, offset: 0.3 },
    { transform: "translate(70px, -90px) rotate(-38deg)", opacity: 0 },
  ], { duration: 420, easing: "cubic-bezier(0.4, 0, 0.8, 0.6)" });
  await wait(120);
  room(env, cv.offsetHeight * rise + 4);
  await anim(cv, [
    { transform: "translateY(0) rotate(0)" },
    { transform: `translateY(-${rise * 100 + 6}%) rotate(-3deg)`, offset: 0.7 },
    { transform: `translateY(-${rise * 100}%) rotate(-2deg)` },
  ], { duration: 620, easing: EASE_OUT });
}

/** The cover slides back in and the envelope drops out of the row. */
export async function dropOut(env: HTMLElement, withCover = true) {
  room(env, 0);
  const cv = env.querySelector<HTMLElement>(":scope > .cv");
  if (reduced()) return anim(env, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
  if (withCover && cv) await anim(cv, [{ transform: getComputedStyle(cv).transform }, { transform: "translateY(0) rotate(0)" }], { duration: 240, easing: "ease-in" });
  await anim(env, [{ transform: "none", opacity: 1 }, { transform: "translateY(36px) rotate(7deg)", opacity: 0 }], { duration: 240, easing: "ease-in" });
}

/** The flyer comes off the wall once nothing is left in it. */
export function unpin(flyer: HTMLElement) {
  if (reduced()) return anim(flyer, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
  return anim(flyer, [{ opacity: 1 }, { transform: "translateY(30px) rotate(3deg)", opacity: 0 }], { duration: 320, easing: "ease-in" });
}

/** Back to the closed envelope, e.g. when a write failed. */
export function reset(env: HTMLElement) {
  room(env, 0);
  env.classList.remove("torn");
  for (const a of env.getAnimations({ subtree: true })) a.cancel();
  env.querySelectorAll<HTMLElement>(".front, .face, .fib").forEach((el) => {
    el.style.clipPath = "";
    el.style.top = "";
  });
}
