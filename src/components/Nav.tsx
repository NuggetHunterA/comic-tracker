import { useLayoutEffect, useRef } from "react";
import { slideTab } from "../lib/motion";

export type Tab = "plan" | "stapel" | "katalog" | "serien";

export const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "stapel", label: "Stapel" },
  { id: "katalog", label: "Katalog" },
  { id: "serien", label: "Serien" },
];

export function Nav({ tab, counters }: { tab: Tab; counters: Record<Tab, string> }) {
  const ref = useRef<HTMLElement>(null);
  const last = useRef(tab);
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = tab;
    if (prev === tab) return;
    const label = (id: Tab) => ref.current?.querySelector<HTMLElement>(`a[href="#${id}"] .l`);
    const from = label(prev);
    const to = label(tab);
    if (from && to) slideTab(from, to);
  }, [tab]);

  return (
    <nav className="nav" aria-label="Hauptnavigation" ref={ref}>
      {TABS.map((t) => (
        <a key={t.id} href={`#${t.id}`} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
          <span className="l">
            <span className="ps" aria-hidden="true" />
            <span className="pb" aria-hidden="true" />
            {t.label}
          </span>
          <span className="c">{counters[t.id]}</span>
        </a>
      ))}
    </nav>
  );
}
