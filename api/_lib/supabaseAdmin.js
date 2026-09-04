import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error("SUPABASE_URL/VITE_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY skal sættes som server-miljøvariabler.");
    err.statusCode = 500;
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
