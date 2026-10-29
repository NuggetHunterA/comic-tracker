import { useState } from "react";
import { metron } from "../lib/supabase";

export interface FoundSeries {
  id: number;
  name: string;
  year_began: number | null;
  issue_count: number | null;
  publisher: string | null;
  series_type: string | null;
}

/** Searches Metron through the edge function. */
export function SeriesSearch({ onPick, picked }: { onPick: (s: FoundSeries) => void; picked?: number }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundSeries[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await metron<{ results: FoundSeries[] }>({ action: "search-series", q: q.trim() });
      setResults(r.results);
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Suche fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <form onSubmit={search} style={{ display: "flex", gap: 8 }}>
        <label className="sr-only" htmlFor="series-q">Serie suchen</label>
        <input id="series-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. Nightwing" autoComplete="off" />
        <button type="submit" className="btn solid" disabled={busy}>{busy ? "Suche …" : "Suchen"}</button>
      </form>
      {error && <p role="alert" className="stk" style={{ whiteSpace: "normal", margin: 0 }}>{error}</p>}
      {results && results.length === 0 && <p className="mut" style={{ margin: 0 }}>Nichts gefunden. Versuch es mit dem Seriennamen ohne Jahr.</p>}
      {results && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {results.map((s) => (
            <button key={s.id} type="button" className={`sr ${picked === s.id ? "on" : ""}`} aria-pressed={picked === s.id} onClick={() => onPick(s)}>
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <strong>{s.name}</strong>
                <span className="d mut" style={{ fontSize: 12 }}>
                  {[s.publisher, s.series_type, s.issue_count != null ? `${s.issue_count} HEFTE` : null].filter(Boolean).join(" · ").toUpperCase()}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
