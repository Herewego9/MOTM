import { getSupabaseAdmin } from "./supabaseAdmin.js";

export const SHARED_KEY = "st70-shared";

/** Fjerner hemmeligheder og personlige felter før lagring/udstilling. */
export function sanitizeShared(shared) {
  if (!shared || typeof shared !== "object" || Array.isArray(shared)) return {};
  const clean = { ...shared };
  delete clean.dbuApiKey;
  delete clean.votedMatches;
  delete clean._lastUpdated;
  return clean;
}

export async function loadShared() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("kv_store")
    .select("value, updated_at")
    .eq("key", SHARED_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return { shared: {}, updated_at: null };
  return { shared: sanitizeShared(data.value), updated_at: data.updated_at || null };
}

export async function saveShared(shared) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const value = sanitizeShared(shared);
  const { error } = await supabase
    .from("kv_store")
    .upsert({ key: SHARED_KEY, value, updated_at: nowIso });
  if (error) throw error;
  return nowIso;
}
