import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { SHARED_KEY, sanitizeShared, saveShared } from "./sharedStore.js";
import { getClubSlug, getDataBackend } from "./dataBackend.js";

function nameKey(name) {
  return String(name || "").trim().toLowerCase();
}

async function getClubOrThrow(supabase, slug = getClubSlug()) {
  const { data, error } = await supabase.from("clubs").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error(`Klub '${slug}' findes ikke i relational schema. Kør migrering først.`);
    err.statusCode = 404;
    throw err;
  }
  return data;
}

async function ensureCurrentSeason(supabase, clubId, label = "Aktuel sæson") {
  const { data: existing, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("club_id", clubId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await supabase
    .from("seasons")
    .insert({ club_id: clubId, label, is_current: true })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function upsertPlayer(supabase, clubId, displayName) {
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

/** Bygger bagudkompatibel shared-DTO til web-appen. */
export async function buildSharedDto(clubSlug = getClubSlug()) {
  const supabase = getSupabaseAdmin();
  const club = await getClubOrThrow(supabase, clubSlug);

  const [
    { data: seasons, error: seasonsError },
    { data: players, error: playersError },
    { data: matches, error: matchesError },
    { data: laundry, error: laundryError },
  ] = await Promise.all([
    supabase.from("seasons").select("*").eq("club_id", club.id).order("created_at", { ascending: true }),
    supabase.from("players").select("*").eq("club_id", club.id).eq("active", true).order("display_name"),
    supabase.from("matches").select("*").eq("club_id", club.id).order("sort_index", { ascending: true }),
    supabase.from("laundry_assignments").select("*").eq("club_id", club.id).order("assigned_at", { ascending: true }),
  ]);
  if (seasonsError) throw seasonsError;
  if (playersError) throw playersError;
  if (matchesError) throw matchesError;
  if (laundryError) throw laundryError;

  const matchIds = (matches || []).map((m) => m.id);
  let votesRows = [];
  let statsRows = [];
  if (matchIds.length) {
    const [{ data: v, error: ve }, { data: s, error: se }] = await Promise.all([
      supabase.from("votes").select("match_id, display_name_snapshot, count").in("match_id", matchIds),
      supabase.from("match_player_stats").select("*").in("match_id", matchIds),
    ]);
    if (ve) throw ve;
    if (se) throw se;
    votesRows = v || [];
    statsRows = s || [];
  }

  const matchById = Object.fromEntries((matches || []).map((m) => [m.id, m]));
  const openMatch = (matches || []).find((m) => m.voting_status === "open") || null;

  const votes = {};
  for (const row of votesRows) {
    const match = matchById[row.match_id];
    if (!match) continue;
    const ext = match.external_id;
    if (!votes[ext]) votes[ext] = {};
    const key = nameKey(row.display_name_snapshot);
    if (!votes[ext][key]) votes[ext][key] = { name: row.display_name_snapshot, count: 0 };
    votes[ext][key].count += Number(row.count) || 1;
  }

  const revealed = {};
  const matchStats = {};
  for (const match of matches || []) {
    if (match.voting_status === "revealed") revealed[match.external_id] = true;
    matchStats[match.external_id] = {
      players: [],
      motmKey: match.motm_name ? nameKey(match.motm_name) : null,
      motmName: match.motm_name || null,
    };
  }
  for (const row of statsRows) {
    const match = matchById[row.match_id];
    if (!match) continue;
    const bucket = matchStats[match.external_id] || { players: [], motmKey: null, motmName: null };
    bucket.players.push({
      name: row.display_name,
      goals: row.goals || 0,
      assists: row.assists || 0,
      yellowCards: row.yellow_cards || 0,
      redCards: row.red_cards || 0,
    });
    matchStats[match.external_id] = bucket;
  }

  const seasonHistory = (seasons || [])
    .filter((s) => !s.is_current)
    .map((s) => ({
      id: s.id,
      label: s.label,
      archivedAt: s.archived_at,
      ...(s.snapshot && typeof s.snapshot === "object" ? s.snapshot : {}),
    }));

  const shared = sanitizeShared({
    openMatchId: openMatch ? openMatch.external_id : null,
    votes,
    revealed,
    matchStats,
    squadNames: (players || []).map((p) => p.display_name).sort((a, b) => a.localeCompare(b, "da")),
    matches: (matches || []).map((m) => {
      const raw = m.raw && typeof m.raw === "object" ? { ...m.raw } : {};
      delete raw.id;
      delete raw.home;
      delete raw.away;
      delete raw.date;
      return {
        ...raw,
        id: m.external_id,
        home: m.home_name,
        away: m.away_name,
        date: m.kickoff_at,
        competition: m.competition || club.competition || null,
      };
    }),
    seasonHistory,
    laundryHistory: (laundry || []).map((l) => ({
      id: l.external_ref || l.id,
      name: l.player_name,
      date: l.assigned_at,
      matchId: l.match_id ? matchById[l.match_id]?.external_id || null : null,
      matchLabel: l.match_label || null,
    })),
    teamName: club.name,
    competition: club.competition || null,
    dbuPoolId: club.dbu_pool_id || "",
    dbuTeamId: club.dbu_team_id || "",
  });

  return { shared, club };
}

/** Spejl DTO til kv_store, så eksisterende Realtime-klient fortsætter uændret. */
export async function publishSharedMirror(clubSlug = getClubSlug()) {
  const { shared } = await buildSharedDto(clubSlug);
  const updated_at = await saveShared(shared);
  return { shared, updated_at };
}

/** Atomar stemme via RPC + DTO-spejl. */
export async function castRelationalVote({ matchId, player, voterKey, clubSlug = getClubSlug() }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("cast_vote", {
    p_club_slug: clubSlug,
    p_match_external_id: String(matchId),
    p_voter_key: String(voterKey),
    p_player_name: String(player).trim(),
  });
  if (error) {
    const msg = error.message || "Kunne ikke gemme stemme.";
    const err = new Error(msg);
    if (/ikke åben/i.test(msg)) err.statusCode = 409;
    else if (/findes ikke/i.test(msg)) err.statusCode = 404;
    else if (/ugyldigt|mangler/i.test(msg)) err.statusCode = 400;
    else err.statusCode = 500;
    throw err;
  }

  const published = await publishSharedMirror(clubSlug);
  return {
    shared: published.shared,
    updated_at: published.updated_at,
    vote: data,
    alreadyVoted: !!(data && data.alreadyVoted),
  };
}

/**
 * Admin full-sync: shared-DTO → relationelle tabeller (fase 1).
 * Stemmer gemmes som legacy-aggregates for at bevare counts.
 */
export async function syncRelationalFromShared(sharedInput, clubSlug = getClubSlug()) {
  const supabase = getSupabaseAdmin();
  const shared = sanitizeShared(sharedInput);
  const teamName = shared.teamName || clubSlug.toUpperCase();

  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .upsert(
      {
        slug: clubSlug,
        name: teamName,
        dbu_pool_id: shared.dbuPoolId || "",
        dbu_team_id: shared.dbuTeamId || "",
        competition: shared.competition || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("*")
    .single();
  if (clubError) throw clubError;

  const season = await ensureCurrentSeason(supabase, club.id, shared.competition || "Aktuel sæson");

  const squad = Array.isArray(shared.squadNames) ? shared.squadNames : [];
  const playerByKey = {};
  for (const name of squad) {
    const p = await upsertPlayer(supabase, club.id, name);
    if (p) playerByKey[p.name_key] = p;
  }

  if (squad.length) {
    const keys = new Set(squad.map(nameKey));
    const { data: allPlayers, error: listErr } = await supabase
      .from("players")
      .select("id, name_key")
      .eq("club_id", club.id);
    if (listErr) throw listErr;
    const inactiveIds = (allPlayers || []).filter((p) => !keys.has(p.name_key)).map((p) => p.id);
    if (inactiveIds.length) {
      const { error } = await supabase.from("players").update({ active: false }).in("id", inactiveIds);
      if (error) throw error;
    }
  }

  const matches = Array.isArray(shared.matches) ? shared.matches : [];
  const openId = shared.openMatchId != null ? String(shared.openMatchId) : null;
  const revealed = shared.revealed || {};
  const matchRowByExternal = {};

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const externalId = String(m.id);
    let status = "closed";
    if (openId && externalId === openId) status = "open";
    else if (revealed[externalId] || revealed[m.id]) status = "revealed";

    const stats = shared.matchStats?.[externalId] || shared.matchStats?.[m.id] || {};
    const motmName = stats.motmName || null;
    let motmPlayerId = null;
    if (motmName) {
      const p = playerByKey[nameKey(motmName)] || (await upsertPlayer(supabase, club.id, motmName));
      if (p) {
        playerByKey[p.name_key] = p;
        motmPlayerId = p.id;
      }
    }

    const { id: _id, home, away, date, competition, ...rest } = m;
    const { data: row, error } = await supabase
      .from("matches")
      .upsert(
        {
          club_id: club.id,
          season_id: season.id,
          external_id: externalId,
          home_name: home || "",
          away_name: away || "",
          kickoff_at: date || null,
          competition: competition || shared.competition || null,
          voting_status: status,
          motm_player_id: motmPlayerId,
          motm_name: motmName,
          sort_index: i,
          raw: rest,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "club_id,external_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    matchRowByExternal[externalId] = row;
  }

  const keepExternal = new Set(matches.map((m) => String(m.id)));
  const { data: existingMatches, error: exErr } = await supabase
    .from("matches")
    .select("id, external_id")
    .eq("club_id", club.id)
    .eq("season_id", season.id);
  if (exErr) throw exErr;
  const toDelete = (existingMatches || []).filter((m) => !keepExternal.has(m.external_id)).map((m) => m.id);
  if (toDelete.length) {
    const { error } = await supabase.from("matches").delete().in("id", toDelete);
    if (error) throw error;
  }

  for (const [externalId, matchRow] of Object.entries(matchRowByExternal)) {
    const stats = shared.matchStats?.[externalId] || { players: [] };
    const { error: delStatsErr } = await supabase.from("match_player_stats").delete().eq("match_id", matchRow.id);
    if (delStatsErr) throw delStatsErr;

    for (const player of stats.players || []) {
      const p = playerByKey[nameKey(player.name)] || (await upsertPlayer(supabase, club.id, player.name));
      if (!p) continue;
      playerByKey[p.name_key] = p;
      const { error } = await supabase.from("match_player_stats").insert({
        match_id: matchRow.id,
        player_id: p.id,
        display_name: player.name,
        goals: player.goals || 0,
        assists: player.assists || 0,
        yellow_cards: player.yellowCards || 0,
        red_cards: player.redCards || 0,
      });
      if (error) throw error;
    }

    const { error: delVotesErr } = await supabase.from("votes").delete().eq("match_id", matchRow.id);
    if (delVotesErr) throw delVotesErr;

    const matchVotes = shared.votes?.[externalId] || {};
    for (const [key, entry] of Object.entries(matchVotes)) {
      const displayName = entry?.name || key;
      const count = Number(entry?.count) || 0;
      if (count <= 0) continue;
      const p = playerByKey[nameKey(displayName)] || (await upsertPlayer(supabase, club.id, displayName));
      if (!p) continue;
      playerByKey[p.name_key] = p;
      const { error } = await supabase.from("votes").insert({
        club_id: club.id,
        match_id: matchRow.id,
        player_id: p.id,
        voter_key: `legacy-aggregate:${externalId}:${p.name_key}`,
        display_name_snapshot: displayName,
        count,
      });
      if (error) throw error;
    }
  }

  const history = Array.isArray(shared.seasonHistory) ? shared.seasonHistory : [];
  const { error: delSeasonsErr } = await supabase
    .from("seasons")
    .delete()
    .eq("club_id", club.id)
    .eq("is_current", false);
  if (delSeasonsErr) throw delSeasonsErr;
  for (const snap of history) {
    const { error } = await supabase.from("seasons").insert({
      club_id: club.id,
      label: snap.label || "Arkiveret sæson",
      is_current: false,
      archived_at: snap.archivedAt || snap.archived_at || new Date().toISOString(),
      snapshot: snap,
    });
    if (error) throw error;
  }

  const { error: delLaundryErr } = await supabase.from("laundry_assignments").delete().eq("club_id", club.id);
  if (delLaundryErr) throw delLaundryErr;
  for (const entry of shared.laundryHistory || []) {
    const p = entry.name
      ? playerByKey[nameKey(entry.name)] || (await upsertPlayer(supabase, club.id, entry.name))
      : null;
    const matchRow = entry.matchId ? matchRowByExternal[String(entry.matchId)] : null;
    const { error } = await supabase.from("laundry_assignments").insert({
      club_id: club.id,
      match_id: matchRow?.id || null,
      player_id: p?.id || null,
      player_name: entry.name || "Ukendt",
      match_label: entry.matchLabel || null,
      assigned_at: entry.date || new Date().toISOString(),
      external_ref: entry.id != null ? String(entry.id) : null,
    });
    if (error) throw error;
  }

  const updated_at = await saveShared(shared);
  return { shared, updated_at, clubId: club.id };
}

export async function healthCheck() {
  const backend = getDataBackend();
  const supabase = getSupabaseAdmin();
  const started = Date.now();

  const { error } = await supabase.from("kv_store").select("key").eq("key", SHARED_KEY).limit(1);
  if (error) {
    return {
      ok: false,
      backend,
      clubSlug: getClubSlug(),
      latencyMs: Date.now() - started,
      error: error.message,
      time: new Date().toISOString(),
    };
  }

  let relational = null;
  if (backend === "relational") {
    const { error: relError, count } = await supabase.from("clubs").select("id", { count: "exact", head: true });
    relational = relError ? { ok: false, error: relError.message } : { ok: true, clubs: count ?? 0 };
  }

  return {
    ok: true,
    backend,
    clubSlug: getClubSlug(),
    latencyMs: Date.now() - started,
    relational,
    kvKey: SHARED_KEY,
    time: new Date().toISOString(),
  };
}
