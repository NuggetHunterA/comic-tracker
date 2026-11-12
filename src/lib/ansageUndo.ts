// After an Ansage was taken over: "6 Hefte nach oben gelegt · Rückgängig".
import { useSyncExternalStore } from "react";
import type { ListEntry } from "./plan";

export interface AnsageUndo {
  text: string;
  /** The reading list before, put back by "Rückgängig". */
  before: ListEntry[];
}

let current: AnsageUndo | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function offerAnsageUndo(u: AnsageUndo | null) {
  current = u;
  emit();
}

export function useAnsageUndo(): AnsageUndo | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current);
}
