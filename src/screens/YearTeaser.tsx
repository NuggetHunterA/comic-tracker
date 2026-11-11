import { useState } from "react";
import { useStore } from "../lib/store";
import { navigate } from "../lib/route";
import { TEASER_FROM, markWallSeen, useYear, wallSeen } from "./Jahreswand";


/** From 20 December the year is done printing: one strip in the plan until the wall has been opened or the strip closed. */
export function YearTeaser() {
  const { today } = useStore();
  const year = Number(today.slice(0, 4));
  const { stats } = useYear(year);
  const [closed, setClosed] = useState(() => wallSeen(year));
  if (closed || today < `${year}${TEASER_FROM}` || stats.count === 0) return null;
  return (
    <div className="jw-teaser">
      <button type="button" className="open" onClick={() => navigate({ tab: "stapel", sel: { kind: "year", year } })}>
        <span className="stk">{year}</span>
        <span className="t">
          <strong>Dein Jahr ist fertig gedruckt</strong>
          <span className="d">{stats.count} {stats.count === 1 ? "HEFT" : "HEFTE"} · ANSEHEN ›</span>
        </span>
      </button>
      <button type="button" className="x" aria-label="Hinweis schließen" onClick={() => { markWallSeen(year); setClosed(true); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
