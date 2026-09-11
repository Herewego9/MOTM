#!/usr/bin/env node
/**
 * Migrér st70-shared (kv_store blob) → relationelle tabeller.
 *
 * Usage:
 *   node scripts/migrate-kv-to-relational.mjs --dry-run
 *   node scripts/migrate-kv-to-relational.mjs --apply
 *
 * Kræver env:
 *   SUPABASE_URL (eller VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   MOTM_CLUB_SLUG (default st70)
 *
 * Kør KUN mod staging først. Produktion kræver eksplicit GO.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local if present (optional)
try {
  const envPath = resolve(root, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local */
}

const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry-run") || !APPLY;
const CLUB_SLUG = (process.env.MOTM_CLUB_SLUG || "st70").toLowerCase();
const SHARED_KEY = "st70-shared";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mangler SUPABASE_URL/VITE_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function nameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function summarize(shared) {
  return {
    teamName: shared.teamName || null,
    competition: shared.competition || null,
    matches: (shared.matches || []).length,
    squadNames: (shared.squadNames || []).length,
    voteMatches: Object.keys(shared.votes || {}).length,
    totalVotes: Object.values(shared.votes || {}).reduce(
      (sum, bucket) => sum + Object.values(bucket || {}).reduce((s, e) => s + (e.count || 0), 0),
      0,
    ),
    revealed: Object.keys(shared.revealed || {}).length,
    matchStats: Object.keys(shared.matchStats || {}).length,
    seasonHistory: (shared.seasonHistory || []).length,
    laundryHistory: (shared.laundryHistory || []).length,
    openMatchId: shared.openMatchId ?? null,
  };
}

async function upsertPlayer(clubId, displayName) {
  const key = nameKey(displayName);
  if (!key) return null;
  const { data, error } = await supabase
    .from("players")
    .upsert(
      {
        club_id: clubId,
        display_name: String(displayName).trim(),
        name_key: key,
        active: true,
      },
      { onConflict: "club_id,name_key" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  console.log(`Mode: ${DRY ? "DRY-RUN (ingen writes)" : "APPLY"}`);
  console.log(`Club slug: ${CLUB_SLUG}`);
  console.log(`Source key: ${SHARED_KEY}`);

  const { data: row, error } = await supabase
    .from("kv_store")
    .select("value, updated_at")
    .eq("key", SHARED_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!row?.value) {
    console.error("Ingen blob fundet for", SHARED_KEY);
    process.exit(1);
  }

  const shared = row.value;
  const summary = summarize(shared);
  console.log("\nBlob summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (DRY) {
    console.log("\nDry-run færdig. Kør med --apply for at skrive til relational tables.");
    console.log("Bemærk: historiske stemmer migreres som aggregates (ingen individuelle voter-id'er).");
    return;
  }

  // Dynamic import of sync helper (same logic as API)
  process.env.MOTM_CLUB_SLUG = CLUB_SLUG;
  process.env.DATA_BACKEND = "relational";

  const { syncRelationalFromShared } = await import("../api/_lib/relationalStore.js");
  const result = await syncRelationalFromShared(shared, CLUB_SLUG);
  console.log("\nMigration applied.");
  console.log({ clubId: result.clubId, updated_at: result.updated_at });

  // Verify counts
  const { count: matchCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("club_id", result.clubId);
  const { count: playerCount } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("club_id", result.clubId)
    .eq("active", true);
  const { count: voteCount } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .eq("club_id", result.clubId);

  console.log("Verification:", {
    matches: matchCount,
    activePlayers: playerCount,
    voteRows: voteCount,
    expectedMatches: summary.matches,
    expectedSquad: summary.squadNames,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
