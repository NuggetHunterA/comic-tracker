import { useCallback, useState } from "react";
import { useStore } from "../lib/store";

/** Runs a write, then reloads. Keeps the last error for display. */
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
      } catch (e) {
        setError((e as { message?: string })?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  return { run, busy, error };
}
