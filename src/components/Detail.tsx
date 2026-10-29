import { useEffect, type ReactNode } from "react";

/** Detail pane when unfolded, bottom sheet when folded. */
export function Detail({ wide, label, onClose, children }: { wide: boolean; label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (wide) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide, onClose]);

  if (wide) {
    return (
      <section className="pane detail" aria-label={label}>
        {children}
      </section>
    );
  }
  return (
    <>
      <div className="sheet-back" onClick={onClose} aria-hidden="true" />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-bar">
          <button type="button" className="iconbtn" aria-label="Schließen" onClick={onClose}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </section>
    </>
  );
}

export function EmptyDetail({ text }: { text: string }) {
  return <p className="mut" style={{ margin: "auto", fontSize: 16, maxWidth: 320, textAlign: "center" }}>{text}</p>;
}
