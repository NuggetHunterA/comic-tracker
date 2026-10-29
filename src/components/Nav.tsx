export type Tab = "plan" | "stapel" | "katalog" | "serien";

export const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "stapel", label: "Stapel" },
  { id: "katalog", label: "Katalog" },
  { id: "serien", label: "Serien" },
];

export function Nav({ tab, counters }: { tab: Tab; counters: Record<Tab, string> }) {
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <a key={t.id} href={`#${t.id}`} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
          <span className="l">{t.label}</span>
          <span className="c">{counters[t.id]}</span>
        </a>
      ))}
    </nav>
  );
}
