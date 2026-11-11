/**
 * A failed write or load: what went wrong in one sentence, and "Nochmal" when
 * running it again can help.
 */
export function ErrorNote({ error, onRetry, busy, prefix }: { error: string | null; onRetry?: () => void; busy?: boolean; prefix?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className="oops">
      <span>{prefix ? `${prefix} ${error}` : error}</span>
      {onRetry && (
        <button type="button" className="btn solid" onClick={onRetry} disabled={busy}>Nochmal</button>
      )}
    </div>
  );
}
