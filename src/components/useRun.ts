import { useCallback, useState } from "react";
import { useStore } from "../lib/store";
import { isNetworkError } from "../lib/offline";

/** Runs a write, then reloads. Keeps the last error for display; resolves to whether it worked. */
export function useRun() {
  const { reload } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        setError(isNetworkError(e) ? "Geht nur mit Netz. „Gelesen“ und Bewertungen merkt sich die App auch ohne." : (e as { message?: string })?.message ?? String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  return { run, busy, error };
}
