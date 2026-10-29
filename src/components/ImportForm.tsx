import { useState } from "react";
import { metron, supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import type { Format } from "../lib/types";
import { FormatChips } from "./FormatChips";
import { SeriesSearch, type FoundSeries } from "./SeriesSearch";

/** Old pile: pick a series and a number range; all of it counts as owned. */
export function ImportForm({ onDone }: { onDone: () => void }) {
  const { reload, today } = useStore();
  const [series, setSeries] = useState<FoundSeries | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<Format>("print");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!series) return;
    const a = Number(from);
    const b = Number(to || from);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
      setMsg("Bitte eine gültige Spanne angeben, z. B. 113 bis 127.");
      return;
    }
    setBusy(true);
    setMsg("Hole die Hefte von Metron. Das dauert bei langen Serien bis zu einer Minute.");
    try {
      await metron({ action: "sync-series", series_id: series.id });
      const { data, error } = await supabase.from("issues").select("id").eq("series_id", series.id).gte("sort_number", a).lte("sort_number", b);
      if (error) throw error;
      if (!data?.length) {
        setMsg("In dieser Spanne kennt Metron keine Hefte. Stimmt der Band?");
        return;
      }
      const rows = data.map((i) => ({
        issue_id: i.id,
        status: "pile",
        format,
        old_pile: true,
        bought_on: format === "infinite" ? null : today,
      }));
      const { error: e2 } = await supabase.from("user_issues").upsert(rows, { onConflict: "user_id,issue_id", ignoreDuplicates: true });
      if (e2) throw e2;
      await reload();
      setMsg(`${rows.length} Hefte von ${series.name} liegen jetzt auf dem Stapel.`);
      setFrom("");
      setTo("");
    } catch (err) {
      setMsg((err as { message?: string })?.message ?? "Das hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 30 }}>Altbestand eintragen</h2>
      <span className="mut" style={{ fontSize: 15 }}>Hefte, die schon bei dir liegen. Sie kommen im Plan vor allem anderen dran.</span>
      <SeriesSearch picked={series?.id} onPick={setSeries} />
      {series && (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <strong style={{ fontSize: 17 }}>{series.name}</strong>
          <div style={{ display: "flex", gap: 10 }}>
            <label className="field" style={{ flex: 1 }}>Von #<input type="number" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
            <label className="field" style={{ flex: 1 }}>Bis #<input type="number" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <FormatChips value={format} onChange={setFormat} />
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn solid" style={{ flex: 1 }} disabled={busy}>{busy ? "Trage ein …" : "Auf den Stapel"}</button>
            <button type="button" className="btn" onClick={onDone}>Fertig</button>
          </div>
        </form>
      )}
      {msg && <p role="status" style={{ margin: 0, fontSize: 15 }}>{msg}</p>}
    </div>
  );
}
