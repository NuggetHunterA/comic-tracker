import { useCallback, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { report } from "../lib/errors";
import { isNetworkError } from "../lib/offline";

/**
 * Runs a write, then reloads. Keeps the last error, in German, for display;
 * `retry` runs the failed write again. Resolves to whether it worked.
 */
export function useRun() {
  const { reload } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<(() => Promise<unknown>) | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      last.current = fn;
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reload();
        last.current = null;
        return true;
      } catch (e) {
        setError(isNetworkError(e) ? "Geht nur mit Netz. „Gelesen“ und Bewertungen merkt sich die App auch ohne." : report(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  const retry = useCallback(() => {
    if (last.current) void run(last.current);
  }, [run]);
  return { run, retry, busy, error };
}
