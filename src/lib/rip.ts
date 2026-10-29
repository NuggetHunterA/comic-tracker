// Tears a cover off the wall when an issue is marked read. The real cover hides
// and two torn halves, built on top of it in page coordinates, fall away; a
// scrap stays under the tape for a moment. Everything is temporary DOM, so the
// card underneath may re-render or unmount while the halves are still falling.

export const RIP_MS = 900;
/** When the wall may reshuffle: the halves are already falling clear. */
export const RIP_RELEASE_MS = Math.round(RIP_MS * 0.58);

type Pt = [number, number];

const r = (a: number, b: number) => a + Math.random() * (b - a);
const poly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;
const jitter = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map(([x, y]) => [x + dx * r(0.6, 1.4), y + dy * r(0.6, 1.4)]);

/** Torn shapes in percent of the cover box. Different every time. */
function shapes() {
  // Bottom edge of the scrap that stays under the tape.
  const sL = r(22, 28);
  const sR = r(72, 78);
  const steps = 7;
  const edge: Pt[] = [[sL, 0], [sL + r(1, 3), r(4, 7)]];
  for (let i = 1; i < steps; i++) edge.push([sL + ((sR - sL) * i) / steps + r(-2, 2), r(7, 15)]);
  edge.push([sR - r(1, 3), r(4, 7)], [sR, 0]);
  const m = Math.floor(edge.length / 2);

  // The tear runs from the scrap to the bottom edge as a damped random walk.
  const [x0, y0] = edge[m];
  const xn = r(36, 64);
  const n = 14;
  const tear: Pt[] = [];
  let drift = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    drift = (drift + r(-2.2, 2.2)) * 0.8;
    tear.push([x0 + (xn - x0) * t + drift + r(-1.6, 1.6), y0 + (100 - y0) * t + r(-1, 1)]);
  }
  tear.push([xn, 100]);

  const edgeL = edge.slice(1, m + 1);
  const edgeR = edge.slice(m);
  const back = [...tear].reverse();
  return {
    xn,
    left: [[0, 0], edge[0], ...edgeL, ...tear, [0, 100]] as Pt[],
    right: [...edgeR, [100, 0], [100, 100], ...back] as Pt[],
    // Fibres: the white core of the paper, a little proud of the printed face.
    leftFib: [[0, 0], edge[0], ...jitter(edgeL, 0, 1.6), ...jitter(tear, 1.8, 0), [0, 100]] as Pt[],
    rightFib: [...jitter(edgeR, 0, 1.6), [100, 0], [100, 100], ...jitter(back, -1.2, 0)] as Pt[],
    scrap: edge,
    scrapFib: [edge[0], ...jitter(edge.slice(1, -1), 0, 2.2), edge[edge.length - 1]] as Pt[],
  };
}

function overlay(cv: HTMLElement, cls: string) {
  const b = cv.getBoundingClientRect();
  const w = cv.offsetWidth;
  const h = cv.offsetHeight;
  const o = document.createElement("div");
  o.className = `rip ${cls}`;
  Object.assign(o.style, {
    width: `${w}px`,
    height: `${h}px`,
    left: `${b.left + b.width / 2 - w / 2 + window.scrollX}px`,
    top: `${b.top + b.height / 2 - h / 2 + window.scrollY}px`,
    transform: getComputedStyle(cv).transform,
  });
  document.body.appendChild(o);
  return o;
}

function piece(parent: HTMLElement, cv: HTMLElement, face: Pt[], fibre: Pt[], num?: string) {
  const cs = getComputedStyle(cv);
  const half = document.createElement("div");
  half.className = "rip-half";
  const fib = document.createElement("div");
  fib.className = "rip-layer rip-fibre";
  fib.style.clipPath = poly(fibre);
  const f = document.createElement("div");
  f.className = "rip-layer rip-face";
  Object.assign(f.style, { clipPath: poly(face), backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, filter: cs.filter });
  if (num) {
    const s = document.createElement("span");
    s.className = "num";
    s.textContent = num;
    f.appendChild(s);
  }
  half.append(fib, f);
  parent.appendChild(half);
  return half;
}

const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here */
  }
};

/** Tapes a cover back on: a short drop with a fading shadow. */
export function tapeOn(cv: HTMLElement, delay = 0) {
  const rest = getComputedStyle(cv).transform;
  const base = rest === "none" ? "" : rest;
  cv.animate(
    [
      { transform: `${base} translate(10px, -14px) rotate(4deg) scale(1.08)`, opacity: 0, filter: "drop-shadow(3px 12px 8px rgba(17,17,17,0.35))" },
      { transform: `${base} scale(0.985)`, opacity: 1, filter: "drop-shadow(0 1px 1px rgba(17,17,17,0.2))", offset: 0.75 },
      { transform: base || "none", filter: "drop-shadow(0 0 0 rgba(17,17,17,0))" },
    ],
    { duration: 360, delay, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" },
  );
  cv.querySelector(".tape")?.animate([{ opacity: 0, transform: "rotate(10deg) scaleX(0.6)" }, { opacity: 1 }], {
    duration: 160,
    delay: delay + 260,
    fill: "backwards",
    easing: "ease-out",
  });
}

/**
 * Rips the cover off. Returns `restore`, which shows the real cover again
 * taped back on (for views that keep the issue on screen, or after a failed write).
 */
export function ripCover(cv: HTMLElement): { restore: () => void } {
  const s = shapes();
  const tape = cv.querySelector<HTMLElement>(".tape");
  const num = cv.querySelector(".num")?.textContent ?? undefined;

  const wall = overlay(cv, "rip-wall");
  const scrap = piece(wall, cv, s.scrap, s.scrapFib);
  if (tape) {
    const t = tape.cloneNode(true) as HTMLElement;
    t.style.transform = getComputedStyle(tape).transform;
    wall.appendChild(t);
  }
  const fly = overlay(cv, "rip-fly");
  const L = piece(fly, cv, s.left, s.leftFib, num);
  const R = piece(fly, cv, s.right, s.rightFib);
  L.style.transformOrigin = R.style.transformOrigin = `${s.xn}% 100%`;
  cv.style.visibility = "hidden";

  const first = Math.random() < 0.5 ? -1 : 1; // the half that lets go first
  const fall = (dir: number): Keyframe[] => [
    { transform: "none", filter: "drop-shadow(0 0 0 rgba(17,17,17,0))", offset: 0 },
    { transform: `rotate(${dir * 1.6}deg) scale(1.015)`, filter: "drop-shadow(1px 3px 2px rgba(17,17,17,0.25))", offset: 0.14, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
    { transform: `translate(${dir * 3}%, -1%) rotate(${dir * r(7, 10)}deg)`, filter: "drop-shadow(2px 7px 5px rgba(17,17,17,0.3))", offset: dir === first ? 0.4 : 0.45, easing: "cubic-bezier(0.55, 0, 0.85, 0.5)" },
    { transform: `translate(${dir * r(30, 40)}%, ${r(90, 110)}%) rotate(${dir * r(26, 40)}deg)`, opacity: 1, offset: 0.84 },
    { transform: `translate(${dir * r(38, 46)}%, ${r(115, 130)}%) rotate(${dir * r(36, 48)}deg)`, filter: "drop-shadow(2px 10px 8px rgba(17,17,17,0.2))", opacity: 0 },
  ];
  L.animate(fall(-1), { duration: RIP_MS, fill: "forwards" });
  R.animate(fall(1), { duration: RIP_MS, fill: "forwards" });
  fly.querySelectorAll(".rip-fibre").forEach((f) => f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1 }], { duration: RIP_MS, fill: "forwards" }));
  scrap.querySelector(".rip-fibre")?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1 }], { duration: RIP_MS, fill: "forwards" });
  window.setTimeout(() => buzz(12), RIP_MS * 0.14);
  window.setTimeout(() => buzz(8), RIP_MS * 0.4);

  window.setTimeout(() => {
    fly.remove();
    const fade = wall.animate([{ opacity: 1 }, { opacity: 0, transform: `${wall.style.transform} translateY(4px)` }], { duration: 320, easing: "ease-in", fill: "forwards" });
    fade.onfinish = () => wall.remove();
  }, RIP_MS + 260);

  return {
    restore: () => {
      if (!cv.isConnected) return;
      cv.style.visibility = "";
      tapeOn(cv);
    },
  };
}
