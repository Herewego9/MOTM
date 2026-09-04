import { loadShared, saveShared } from "./_lib/sharedStore.js";

function applyVote(shared, matchId, playerName) {
  const key = playerName.toLowerCase();
  const matchVotes = shared.votes?.[matchId] || {};
  if (matchVotes[key]) {
    matchVotes[key] = { ...matchVotes[key], count: matchVotes[key].count + 1 };
  } else {
    matchVotes[key] = { name: playerName, count: 1 };
  }
  const votes = { ...(shared.votes || {}), [matchId]: matchVotes };

  // Hold MOTM-preview opdateret mens afstemningen er åben (samme logik som klient-reduceren).
  const sorted = Object.entries(matchVotes).sort((a, b) => b[1].count - a[1].count);
  const prevMatchData = shared.matchStats?.[matchId] || { players: [] };
  const matchStats = {
    ...(shared.matchStats || {}),
    [matchId]: {
      ...prevMatchData,
      motmKey: sorted[0]?.[0] || null,
      motmName: sorted[0]?.[1]?.name || null,
    },
  };

  return { ...shared, votes, matchStats };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const matchId = req.body?.matchId;
  const player = typeof req.body?.player === "string" ? req.body.player.trim() : "";
  if (matchId == null || matchId === "" || !player) {
    return res.status(400).json({ error: "Angiv matchId og spillernavn." });
  }
  if (player.length > 80) {
    return res.status(400).json({ error: "Spillernavn er for langt." });
  }

  try {
    const { shared } = await loadShared();
    if (shared.openMatchId == null || String(shared.openMatchId) !== String(matchId)) {
      return res.status(409).json({ error: "Afstemningen er ikke åben for denne kamp." });
    }
    if (shared.revealed?.[matchId]) {
      return res.status(409).json({ error: "Afstemningen er allerede lukket for denne kamp." });
    }

    const next = applyVote(shared, matchId, player);
    const updated_at = await saveShared(next);
    return res.status(200).json({ shared: next, updated_at });
  } catch (e) {
    console.error("vote error:", e);
    return res.status(e.statusCode || 500).json({ error: e.message || "Kunne ikke gemme stemme." });
  }
}
