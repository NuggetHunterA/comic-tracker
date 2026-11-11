import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { eventDone, useStore, type EventView } from "../lib/store";
import { eventHex } from "../lib/events";
import { buzz, finishFinale, jolt, loadSeals, readJustNow, reducedMotion, saveSeals, startFinale, wait } from "../lib/moments";
import { Cover } from "./Cover";
import type { EventRow } from "../lib/types";

/** At most this many covers gather; the rest is a "+N" slip. */
const MAX_COVERS = 24;

/** An event's seal: a round label in its colour with its Kürzel and the parts. */
export function Seal({ event, total, size = "", plus = 0, style }: { event: EventRow; total: number; size?: "" | "sm" | "md"; plus?: number; style?: React.CSSProperties }) {
  const k = event.short || event.name;
  return (
    <span className={`evseal ${size}`} role="img" aria-label={`${event.name}: ${total} von ${total} gelesen${plus ? `, ${plus} neu dazugekommen` : ""}`}
      style={{ ["--c" as string]: eventHex(event.color), ["--ks" as string]: Math.min(1, 3.6 / Math.max(k.length, 1)).toFixed(2), ...style }}>
      <span className="face">
        <span className="k">{k}</span>
        <span className="p">{total}/{total}</span>
      </span>
      {plus > 0 && <span className="plus">+{plus}</span>}
    </span>
  );
}

/** The day an event was read to the end: the last reading date among its issues. */
export function doneOn(v: EventView, readOn: (id: number) => string | null | undefined): string | null {
  let last: string | null = null;
  for (const i of v.order) {
    const d = readOn(i.id);
    if (d && (!last || d > last)) last = d;
  }
  return last;
}

/**
 * Watches the events: when one is read to the end right after a "Gelesen",
 * its covers gather on the screen, the band runs over them and pulls together
 * into the seal. Also keeps the device's list of sealed events up to date.
 */
export function EventFinale() {
  const { events } = useStore();
  const prev = useRef<Map<number, boolean> | null>(null);
  const [show, setShow] = useState<EventView | null>(null);

  useEffect(() => {
    const now = new Map(events.map((v) => [v.event.id, eventDone(v)]));
    const was = prev.current;
    prev.current = events.length ? now : null;
    const seals = loadSeals();
    let changed = false;
    for (const v of events) {
      if (eventDone(v) && seals[v.event.id] !== v.order.length) {
        seals[v.event.id] = v.order.length;
        changed = true;
      }
    }
    if (changed) saveSeals(seals);
    if (!was) return;
    const fresh = events.find((v) => now.get(v.event.id) && was.get(v.event.id) === false);
    if (fresh && readJustNow()) {
      startFinale();
      setShow(fresh);
    }
  }, [events]);

  if (!show) return null;
  return createPortal(<Gathering view={show} onDone={() => { setShow(null); finishFinale(); }} />, document.body);
}

function Gathering({ view, onDone }: { view: EventView; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const running = useRef(new Set<Animation>());
  const started = useRef(false);
  const covers = view.order.slice(0, MAX_COVERS);
  const extra = view.order.length - covers.length;
  const color = eventHex(view.event.color);

  useLayoutEffect(() => {
    const g = root.current;
    if (!g || started.current) return;
    started.current = true;
    const A = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      const a = el.animate(kf, o);
      running.current.add(a);
      if (skip.current) a.finish();
      return a.finished.catch(() => undefined).finally(() => running.current.delete(a));
    };
    const W = (ms: number) => (skip.current ? Promise.resolve() : wait(ms));
    const row = g.querySelector<HTMLElement>(".gx-row")!;
    const band = g.querySelector<HTMLElement>(".gx-band")!;
    const seal = g.querySelector<HTMLElement>(".gx-seal")!;
    const cvs = Array.from(row.querySelectorAll<HTMLElement>(".gx-c"));

    const play = async () => {
      if (reducedMotion()) {
        row.style.opacity = "0";
        band.style.opacity = "0";
        await A(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        buzz(30);
        await W(1100);
      } else {
        seal.style.opacity = "0";
        band.style.clipPath = "inset(0 100% 0 0)";
        await A(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        // 1. The event's covers tape themselves up in reading order.
        cvs.forEach((c, i) => {
          const rot = [-2, 1.5, -1, 2, -1.5][i % 5];
          c.style.transform = `rotate(${rot}deg)`;
          void A(c, [
            { transform: `translate(14px, -26px) rotate(${rot + 6}deg) scale(1.12)`, opacity: 0, filter: "drop-shadow(3px 12px 8px rgba(17,17,17,0.35))" },
            { transform: `rotate(${rot}deg) scale(0.985)`, opacity: 1, filter: "drop-shadow(0 1px 1px rgba(17,17,17,0.2))", offset: 0.75 },
            { transform: `rotate(${rot}deg)`, opacity: 1, filter: "none" },
          ], { duration: 340, delay: Math.min(i * 110, 1400), easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" });
        });
        await W(Math.min(cvs.length * 110, 1400) + 320);
        // 2. The band runs across them.
        band.style.clipPath = "";
        await A(band, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 420, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
        await W(380);
        // 3. Everything pulls together in the middle.
        const box = row.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        cvs.forEach((c, i) => {
          const b = c.getBoundingClientRect();
          void A(c, [
            { transform: c.style.transform, opacity: 1 },
            { transform: `translate(${cx - (b.left + b.width / 2)}px, ${cy - (b.top + b.height / 2)}px) rotate(${i * 25}deg) scale(0.25)`, opacity: 0 },
          ], { duration: 380, delay: Math.abs(i - (cvs.length - 1) / 2) * 25, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)", fill: "forwards" });
        });
        await A(band, [{ transform: "rotate(-2deg) scaleX(1)", opacity: 1 }, { transform: "rotate(160deg) scaleX(0.08)", opacity: 0 }], {
          duration: 420, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)", fill: "forwards",
        });
        // 4. The seal is pressed on.
        seal.style.opacity = "";
        const hit = A(seal, [
          { transform: "rotate(-30deg) scale(2.1)", opacity: 0, filter: "blur(3px)" },
          { transform: "rotate(14deg) scale(0.92)", opacity: 1, filter: "blur(0)", offset: 0.78 },
          { transform: "rotate(9deg) scale(1)", opacity: 1, filter: "none" },
        ], { duration: 420, easing: "cubic-bezier(0.55, 0, 0.85, 0.4)" });
        if (!skip.current) window.setTimeout(() => { if (!skip.current) { buzz(30); jolt(); } }, 330);
        await hit;
        if (skip.current) buzz(30);
        await W(700);
      }
      await A(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: "forwards" });
      onDone();
    };
    void play();
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    if (skip.current) return;
    skip.current = true;
    running.current.forEach((a) => a.finish());
  };

  return (
    <div ref={root} className="gather" role="status" aria-label={`${view.event.name} durchgelesen`} onClick={finish}>
      <div className="gx-row">
        {covers.map((i, k) => (
          <span key={i.id} className="gx-c">
            <Cover issue={i} tape eventMark={false} publisherMark={false} style={{ ["--tr" as string]: `${k % 2 ? -5 : 4}deg` }} />
          </span>
        ))}
        {extra > 0 && <span className="gx-c gx-more">+{extra}</span>}
        <span className="gx-band" style={{ background: color }}>{view.event.name} · TEIL 1–{view.order.length} · GELESEN</span>
      </div>
      <span className="gx-seal"><Seal event={view.event} total={view.order.length} /></span>
      <span className="gx-skip d">ANTIPPEN ZUM ÜBERSPRINGEN</span>
    </div>
  );
}
