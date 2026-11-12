import { useState } from "react";
import { offerAnsageUndo, useAnsageUndo } from "../lib/ansageUndo";
import { useStore } from "../lib/store";
import { report } from "../lib/errors";

const UNDO_MS = 10000;

/** The toner strip after an Ansage: what moved, and "Rückgängig" for ten seconds. */
export function AnsageStrip() {
  const offer = useAnsageUndo();
  const { restoreList } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!offer) return null;
  const dismiss = () => { setError(null); offerAnsageUndo(null); };
  const undo = async () => {
    setBusy(true);
    setError(null);
    try {
      await restoreList(offer.before);
      dismiss();
    } catch (e) {
      setError(report(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`undo ${error ? "failed" : ""}`} key={offer.text + offer.before.length}>
      <p role="status" className="undo-text">{error ?? <strong>{offer.text}</strong>}</p>
      <button type="button" className="undo-go" onClick={() => void undo()} disabled={busy}>
        {busy ? "Moment …" : error ? "Nochmal" : "Rückgängig"}
      </button>
      {error ? (
        <button type="button" className="undo-x" onClick={dismiss} aria-label="Schließen">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" /></svg>
        </button>
      ) : (
        <span className="undo-time" aria-hidden="true" style={{ animationDuration: `${UNDO_MS}ms` }} onAnimationEnd={() => !busy && dismiss()} />
      )}
    </div>
  );
}
