import { createClient } from "@supabase/supabase-js";
import { Hinweis } from "./errors";

export const SUPABASE_URL = "https://towpmroicvnsbobktsfz.supabase.co";
// Publishable key: safe to ship in the browser, access is guarded by RLS.
const SUPABASE_KEY = "sb_publishable_-QgQ6wlQVClXnZlKveY0LA_hAscxxlI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "comics" },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Calls the Metron edge function as the signed-in user. */
export async function metron<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("metron", { body });
  if (error) throw error;
  return data as T;
}

/** Calls the infinite edge function, which finds issue pages on DC Universe Infinite. */
export async function infinite<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("infinite", { body });
  if (error) {
    // The function explains a rejected link in its JSON body.
    const res = (error as { context?: Response }).context;
    const detail = res?.status === 400 ? await res.json?.().catch(() => null) : null;
    if (detail?.error) throw new Hinweis(detail.error);
    throw error;
  }
  return data as T;
}
