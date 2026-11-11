// The evening without network: the last loaded state kept in IndexedDB, and a
// queue of "Gelesen" and ratings that waits there until the network is back.

import type { UserIssue } from "./types";

/** A write that can wait for the network. */
export type QueuedOp =
  | { kind: "read"; issueId: number; day: string }
  | { kind: "rate"; issueId: number; rating: number | null };

const DB = "comic-tracker";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Never lets a broken or missing IndexedDB (private mode, tests) break the app. */
async function quiet<T>(p: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (typeof indexedDB === "undefined") return fallback;
    return await p();
  } catch {
    return fallback;
  }
}

export interface Snapshot<D> {
  data: D;
  /** When it was loaded, ISO timestamp. */
  at: string;
}

export const saveSnapshot = <D>(data: D, at: string) => quiet(() => put("snapshot", { data, at }), undefined);
export const loadSnapshot = <D>() => quiet(() => get<Snapshot<D>>("snapshot"), undefined);

export const loadQueue = () => quiet(async () => (await get<QueuedOp[]>("queue")) ?? [], [] as QueuedOp[]);
export const saveQueue = (q: QueuedOp[]) => quiet(() => put("queue", q), undefined);

/** A later op on the same issue and kind replaces an earlier one. */
export function enqueue(q: QueuedOp[], op: QueuedOp): QueuedOp[] {
  return [...q.filter((o) => !(o.kind === op.kind && o.issueId === op.issueId)), op];
}

/** What a queued op does to the local copy of an issue. */
export function applyOp(ui: UserIssue | undefined, op: QueuedOp): UserIssue | undefined {
  if (!ui) return ui;
  if (op.kind === "read") return { ...ui, status: "read", read_on: op.day };
  return { ...ui, rating: op.rating };
}

/** Writes the queue in order; stops at the first failure and returns what is left. */
export async function flushQueue(q: QueuedOp[], write: (op: QueuedOp) => Promise<unknown>): Promise<{ left: QueuedOp[]; done: number; error: unknown }> {
  for (let k = 0; k < q.length; k++) {
    try {
      await write(q[k]);
    } catch (error) {
      return { left: q.slice(k), done: k, error };
    }
  }
  return { left: [], done: q.length, error: null };
}

/** True when a request failed because there is no network, not because the server said no. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg);
}

/** "HEUTE 09:07", "GESTERN 21:07", "MO 9.11. 21:07". */
export function stampLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `HEUTE ${time}`;
  if (diff === 1) return `GESTERN ${time}`;
  const wd = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"][d.getDay()];
  return `${wd} ${d.getDate()}.${d.getMonth() + 1}. ${time}`;
}
