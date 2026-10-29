import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { addDays, shortDate } from "../lib/dates";
import { issueTitle } from "../lib/labels";
import { tapeOn } from "../lib/rip";
import { Cover } from "./Cover";

const SEEN_KEY = "infinite-drop-seen";
/** At most this many come out of the box; the list underneath names them all. */
const SHOWN = 3;

const seenOn = () => {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};
const markSeen = (day: string) => {
  try {
    localStorage.setItem(SEEN_KEY, day);
  } catch {
    /* private mode: it shows again next time */
  }
};

/**
 * First open of the day: a comic box lands on the plan, the lid flies off and
 * today's new issues on DC Universe Infinite (pile and wishlist) are pulled
 * out and taped to the wall. A tap skips to the end.
 */
export function InfiniteDrop() {
  const { data, items, today } = useStore();
  const [open, setOpen] = useState(false);

  const fresh = useMemo(() => {
    if (!data) return [];
    const delay = data.settings.infinite_delay_days;
    return items
      .filter((i) => {
        if (!i.issue.store_date || addDays(i.issue.store_date, delay) !== today) return false;
        if (i.ui.status === "pile" || i.ui.status === "expected") return i.ui.format === "infinite";
        return i.ui.status === "wishlist" && (i.series?.publisher ?? "").toLowerCase().startsWith("dc");
      })
      .sort((a, b) => Number(a.ui.status === "wishlist") - Number(b.ui.status === "wishlist") || issueTitle(a.issue, a.series).localeCompare(issueTitle(b.issue, b.series)));
  }, [data, items, today]);

  useEffect(() => {
    if (fresh.length > 0 && seenOn() !== today) {
      markSeen(today);
      setOpen(true);
    }
  }, [fresh.length, today]);

  if (!open || fresh.length === 0) return null;
  return <Drop list={fresh} today={today} onClose={() => setOpen(false)} />;
}

type Fresh = ReturnType<typeof useStore>["items"][number];

function Drop({ list, today, onClose }: { list: Fresh[]; today: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const shown = list.slice(0, SHOWN);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const out: Animation[] = [];
    const a = (node: Element | null | undefined, kf: Keyframe[], opt: KeyframeAnimationOptions) => {
      if (!node) return;
      out.push(node.animate(kf, { fill: "both", ...opt }));
    };
    const box = el.querySelector<HTMLElement>(".drop-box")!;
    const front = box.querySelector<HTMLElement>(".front")!;

    a(el.querySelector(".drop-veil"), [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    a(box, [{ transform: "translateY(-110vh) rotate(-4deg)" }, { transform: "translateY(4px) rotate(0.5deg)", offset: 0.82 }, { transform: "none" }], {
      duration: 440,
      delay: 80,
      easing: "cubic-bezier(0.55, 0, 0.9, 0.6)",
    });
    a(box.querySelector(".lid"), [{ transform: "none", opacity: 1 }, { transform: "translate(6px, -18px) rotate(10deg)", opacity: 1, offset: 0.3 }, { transform: "translate(160px, -100px) rotate(48deg)", opacity: 0 }], {
      duration: 380,
      delay: 580,
      easing: "cubic-bezier(0.3, 0, 0.6, 1)",
    });

    // Each cover starts inside the box (measured where it will hang) and is pulled up and over.
    const fb = front.getBoundingClientRect();
    let t = 880;
    el.querySelectorAll<HTMLElement>(".drop-row > *").forEach((cell, k) => {
      const cv = cell.querySelector<HTMLElement>(".cv")!;
      const r = Number(cell.dataset.r);
      const cb = cell.getBoundingClientRect();
      const dx = fb.left + fb.width / 2 - (cb.left + cb.width / 2) + (k - 1) * 8;
      const dy = fb.top + 12 - cb.top;
      a(cell, [
        { transform: `translate(${dx}px, ${dy}px) rotate(${(k - 1) * 3}deg)`, clipPath: "inset(-20px -20px 100% -20px)" },
        { transform: `translate(${dx}px, ${dy - cb.height * 0.95}px) rotate(${(k - 1) * 2}deg)`, clipPath: "inset(-20px -20px 0% -20px)", offset: 0.4, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        { transform: `translate(0, -10px) rotate(${r + 6}deg) scale(1.08)`, clipPath: "inset(-20px -20px 0% -20px)", offset: 0.85 },
        { transform: `rotate(${r}deg)`, clipPath: "inset(-20px -20px 0% -20px)" },
      ], { duration: 640, delay: t, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
      tapeOn(cv, t + 560);
      cell.querySelectorAll(".pinned").forEach((p) => a(p, [{ opacity: 0, transform: "translateY(-20px) rotate(-20deg)" }, { opacity: 1, transform: "rotate(12deg)", offset: 0.4 }, { transform: "rotate(-5deg)", offset: 0.7 }, { transform: "none" }], { duration: 600, delay: t + 640, easing: "ease-out" }));
      t += 220;
    });
    a(box, [{ transform: "none" }, { transform: "translateY(60vh)" }], { duration: 320, delay: t + 380, easing: "cubic-bezier(0.55, 0, 0.9, 0.6)" });
    const end = t + 420;
    a(el.querySelector(".drop-head"), [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: end, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    a(el.querySelector(".drop-list"), [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, delay: end + 60, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    a(el.querySelector(".drop-go"), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 240, delay: end + 120, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    anims.current = out;
    el.querySelector<HTMLElement>(".drop-go")?.focus({ preventScroll: true });
    return () => out.forEach((x) => x.cancel());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const skip = () => anims.current.forEach((x) => x.finish());
  const close = () => {
    const el = root.current;
    if (!el) return onClose();
    skip();
    if (window.location.hash !== "#plan") window.location.hash = "plan";
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).onfinish = onClose;
  };

  return (
    <div className="drop" ref={root} role="dialog" aria-modal="true" aria-label="Neu auf Infinite" onClick={skip}>
      <div className="drop-veil" />
      <div className="drop-body">
        <div className="drop-head">
          <span className="stk">{shortDate(today)} · AB HEUTE LESBAR</span>
          <h2>Neu auf<br />Infinite</h2>
        </div>
        <div className="drop-row">
          {shown.map((i, k) => (
            <div key={i.issue.id} data-r={[-2, 1.5, -1][k]}>
              <Cover issue={i.issue} tape big>
                {i.ui.status === "wishlist" && <span className="pinned"><span className="pin" /><span className="lbl">WUNSCH</span></span>}
              </Cover>
            </div>
          ))}
        </div>
        <ul className="drop-list">
          {list.map((i) => (
            <li key={i.issue.id}>
              {issueTitle(i.issue, i.series)}
              {i.ui.status === "wishlist" && <span className="w">WUNSCH</span>}
            </li>
          ))}
        </ul>
        <button type="button" className="btn hot drop-go" onClick={(e) => { e.stopPropagation(); close(); }}>Zum Plan</button>
      </div>
      <div className="drop-box" aria-hidden="true">
        <div className="front"><span className="hole" /><span className="lbl">Neu auf Infinite<b>{list.length}</b></span></div>
        <div className="lid" />
      </div>
    </div>
  );
}
