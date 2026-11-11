import { useUndo } from "../lib/undo";

/** How long "Rückgängig" stays; paused while a finger or the focus is on the strip. */
const UNDO_MS = 10000;

/**
 * After "Gelesen": a toner strip over the bar, "Batman #154 gelesen ·
 * Rückgängig". The pink line underneath runs down until the strip goes.
 */
export function UndoStrip() {
  const { offer, undo, dismiss, busy, error } = useUndo();
  if (!offer) return null;
  return (
    <div className={`undo ${error ? "failed" : ""}`} key={offer.issueId}>
      <p role="status" className="undo-text">
        {error ?? <><strong>{offer.title}</strong> gelesen</>}
      </p>
      <button type="button" className="undo-go" onClick={() => void undo()} disabled={busy}>
        {busy ? "Moment …" : error ? "Nochmal" : "Rückgängig"}
      </button>
      {error ? (
        <button type="button" className="undo-x" onClick={dismiss} aria-label="Schließen">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" /></svg>
        </button>
      ) : (
        <span className="undo-time" aria-hidden="true" style={{ animationDuration: `${UNDO_MS}ms` }}
          onAnimationEnd={() => !busy && dismiss()} />
      )}
    </div>
  );
}
