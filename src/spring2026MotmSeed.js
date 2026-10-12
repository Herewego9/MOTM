// Forår 2026 MotM-stemmer (Google Sheet) → arkiveret sæson, adskilt fra Efterår.
// Kamp-id = DBU kampnr fra https://dbu.dk/resultater/hold/769359_485672/kampprogram

export const SPRING_2026_SEED_FLAG = "spring2026MotmSeeded";
export const SPRING_2026_ARCHIVE_FLAG = "spring2026Archived";
export const SPRING_2026_ARCHIVE_ID = "forar-2026";
export const SPRING_2026_ARCHIVE_LABEL = "Forår 2026";

export const SPRING_2026_MATCHES = [
  { id: 993208, date: "2026-04-12", time: "14:00", home: "ST 70", away: "Christiansbjerg IF (2)", venue: "Trige Søndergård (Trige gl. Stadion)" },
  { id: 993213, date: "2026-04-25", time: "16:00", home: "Hornslet IF (1)", away: "ST 70", venue: "Sparekassen Danmark Park - Hornslet (kunst)" },
  { id: 993215, date: "2026-05-05", time: "19:00", home: "ST 70", away: "VSK Aarhus (3)", venue: "Trige Søndergård (Trige gl. Stadion)" },
  { id: 993220, date: "2026-05-08", time: "19:00", home: "ST 70", away: "Lisbjerg FC", venue: "Trige Søndergård (Trige gl. Stadion)" },
  { id: 993228, date: "2026-06-07", time: "14:00", home: "ST 70", away: "Hornslet IF (1)", venue: "Trige Søndergård (Trige gl. Stadion)" },
  { id: 993230, date: "2026-06-15", time: "20:00", home: "VSK Aarhus (3)", away: "ST 70", venue: "VSK Aarhus" },
  { id: 993235, date: "2026-06-21", time: "13:00", home: "Lisbjerg FC", away: "ST 70", venue: "Lisbjerg Skole" },
];

/** Stemmer pr. kampnr: { [playerName]: count } — kun non-zero fra sheetet. */
export const SPRING_2026_VOTES_BY_MATCH = {
  993208: {
    "Hussain": 1,
    "Daniel Galler": 7,
  },
  993213: {
    "Hussain": 1,
    "Mayn": 2,
    "Mustafa": 3,
    "Viktor Ramsdahl": 2,
    "Abdullah": 1,
    "Kruse": 3,
  },
  993215: {
    "Hussain": 2,
    "Kruse": 5,
  },
  993220: {
    "Gaston": 1,
    "Silas Ebling": 2,
    "Thomas B": 2,
    "Søren Esbensen": 1,
    "Daniel Galler": 4,
    "Sebastian (Silas' Ven)": 2,
    "Kruse": 2,
  },
  993228: {
    "Andreas M": 1,
    "Sulakshan": 1,
    "Silas Ebling": 1,
    "Thomas B": 2,
    "Søren Esbensen": 1,
    "Abdullah": 6,
    "Kruse": 2,
  },
  993230: {
    "Hussain": 2,
    "Mayn": 5,
    "Andreas M": 2,
    "Silas Ebling": 1,
    "Kruse": 6,
  },
  993235: {
    "Albert": 5,
    "Daniel Galler": 9,
  },
};

const SPRING_SEED_IDS = new Set(SPRING_2026_MATCHES.map(m => String(m.id)));

/** Bygger votes-objekt for én kamp fra { name: count }. */
export function votesFromCounts(counts) {
  const out = {};
  Object.entries(counts || {}).forEach(([name, count]) => {
    if (!count) return;
    const key = name.toLowerCase();
    out[key] = { name, count };
  });
  return out;
}

/**
 * Finder kampens spiller(e) ud fra stemmer.
 * Ved lige stemmetal får alle med top-count KS-kredit (motmKeys).
 */
export function resolveMotm(matchVotes) {
  const entries = Object.entries(matchVotes || {}).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) {
    return { motmKey: null, motmName: null, motmKeys: [], motmNames: [] };
  }
  const top = entries[0][1].count;
  const winners = entries.filter(([, v]) => v.count === top);
  const motmKeys = winners.map(([k]) => k);
  const motmNames = winners.map(([, v]) => v.name);
  return {
    motmKey: motmKeys[0] || null,
    motmName: motmNames.length ? motmNames.join(" / ") : null,
    motmKeys,
    motmNames,
  };
}

/** Normaliseret liste af MotM-vindere fra et matchStats-objekt (bagudkompatibel). */
export function getMotmWinners(matchStat) {
  if (!matchStat) return [];
  if (Array.isArray(matchStat.motmKeys) && matchStat.motmKeys.length) {
    return matchStat.motmKeys.map((key, i) => ({
      key,
      name: (matchStat.motmNames && matchStat.motmNames[i]) || matchStat.motmName || key,
    }));
  }
  if (matchStat.motmKey) {
    return [{ key: matchStat.motmKey, name: matchStat.motmName || matchStat.motmKey }];
  }
  return [];
}

function lookupById(map, id) {
  if (!map) return undefined;
  if (map[id] !== undefined) return map[id];
  const asNum = Number(id);
  if (!Number.isNaN(asNum) && map[asNum] !== undefined) return map[asNum];
  const asStr = String(id);
  if (map[asStr] !== undefined) return map[asStr];
  return undefined;
}

function deleteById(map, id) {
  if (!map) return;
  delete map[id];
  const asNum = Number(id);
  if (!Number.isNaN(asNum)) delete map[asNum];
  delete map[String(id)];
}

/**
 * KUN de 7 kendte Forår 2026 MotM-kampnr.
 * Ingen dato-heuristik – så Efterårskampe aldrig kan rammes ved en fejl.
 */
export function collectSpring2026MatchIds() {
  return new Set(SPRING_SEED_IDS);
}

function isSpringMatchId(id) {
  return SPRING_SEED_IDS.has(String(id));
}

/** Snapshot af alt der IKKE er forårs-id – bruges til at bevise at Efterår er urørt. */
export function snapshotNonSpringSeason(state) {
  const keep = (map) => {
    const out = {};
    Object.entries(map || {}).forEach(([k, v]) => {
      if (!isSpringMatchId(k)) out[String(k)] = v;
    });
    return out;
  };
  return {
    matches: (state.matches || [])
      .filter(m => !isSpringMatchId(m.id))
      .map(m => ({ ...m })),
    votes: keep(state.votes),
    revealed: keep(state.revealed),
    matchStats: keep(state.matchStats),
    openMatchId: state.openMatchId != null && isSpringMatchId(state.openMatchId)
      ? null
      : state.openMatchId,
    squadNames: state.squadNames,
    laundryHistory: state.laundryHistory,
    teamName: state.teamName,
    competition: state.competition,
    dbuPoolId: state.dbuPoolId,
    dbuTeamId: state.dbuTeamId,
  };
}

function assertAutumnUntouched(before, after) {
  const beforeJson = JSON.stringify(before);
  const afterSnap = snapshotNonSpringSeason(after);
  const afterJson = JSON.stringify(afterSnap);
  if (beforeJson !== afterJson) {
    const err = new Error(
      "SIKKERHEDSSTOP: Arkivering ville have ændret Efterårsdata. Afbrudt – intet er gemt."
    );
    err.code = "AUTUMN_GUARD";
    throw err;
  }
}

function buildSpringArchivePayload(state) {
  const byId = new Map((state.matches || []).map(m => [String(m.id), m]));
  for (const stub of SPRING_2026_MATCHES) {
    if (!byId.has(String(stub.id))) byId.set(String(stub.id), stub);
  }

  const matches = [];
  const votes = {};
  const revealed = {};
  const matchStats = {};

  // Udelukkende de 7 seed-kampe – aldrig andre kamp-id'er fra current.
  for (const stub of SPRING_2026_MATCHES) {
    const id = String(stub.id);
    const match = byId.get(id) || stub;
    matches.push(match);

    const existingVotes = lookupById(state.votes, id);
    const seedCounts = SPRING_2026_VOTES_BY_MATCH[stub.id];
    const matchVotes = existingVotes && Object.keys(existingVotes).length
      ? existingVotes
      : votesFromCounts(seedCounts);

    votes[id] = matchVotes;
    revealed[id] = true;
    const motm = resolveMotm(matchVotes);
    const prev = lookupById(state.matchStats, id) || { players: [] };
    // Tag kun MotM/stemmer med fra current for forårs-id; behold evt. players hvis de fandtes på netop dette id.
    matchStats[id] = {
      players: prev.players || [],
      motmKey: motm.motmKey,
      motmName: motm.motmName,
      motmKeys: motm.motmKeys,
      motmNames: motm.motmNames,
    };
  }

  matches.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  return {
    id: SPRING_2026_ARCHIVE_ID,
    label: SPRING_2026_ARCHIVE_LABEL,
    archivedAt: new Date().toISOString(),
    matches,
    votes,
    matchStats,
    revealed,
    competition: "Herrer Serie 5 11:11/9:9 - Forår 2026, Pulje 136",
    teamName: state.teamName || "ST 70",
  };
}

function stripSpringFromCurrent(state) {
  const springIds = collectSpring2026MatchIds();
  const matches = (state.matches || []).filter(m => !isSpringMatchId(m.id));
  const votes = { ...(state.votes || {}) };
  const revealed = { ...(state.revealed || {}) };
  const matchStats = { ...(state.matchStats || {}) };

  for (const id of springIds) {
    deleteById(votes, id);
    deleteById(revealed, id);
    deleteById(matchStats, id);
  }

  let openMatchId = state.openMatchId;
  if (openMatchId != null && isSpringMatchId(openMatchId)) {
    openMatchId = null;
  }

  return { matches, votes, revealed, matchStats, openMatchId };
}

function upsertSeasonHistory(history, archiveEntry) {
  const without = (history || []).filter(s => String(s.id) !== String(SPRING_2026_ARCHIVE_ID));
  const combined = [...without, archiveEntry];
  // Gem højst de 2 seneste sæsoner (= ét år).
  return combined.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)).slice(0, 2);
}

/**
 * Lægger Forår 2026 i seasonHistory og fjerner KUN de 7 forårs-kampnr fra current.
 * Efterår (alle andre id'er + trup/vasketøj/holdnavn) verificeres uændret via guard.
 */
export function applySpring2026MotmSeed(state) {
  if (state[SPRING_2026_ARCHIVE_FLAG]) {
    return { state, applied: false, reason: "already_archived" };
  }

  const autumnBefore = snapshotNonSpringSeason(state);
  const archiveEntry = buildSpringArchivePayload(state);
  const cleaned = stripSpringFromCurrent(state);
  const seasonHistory = upsertSeasonHistory(state.seasonHistory, archiveEntry);

  const next = {
    ...state,
    ...cleaned,
    seasonHistory,
    // Bevar Efterårs-metadata eksplicit (røres aldrig af strip).
    squadNames: state.squadNames,
    laundryHistory: state.laundryHistory,
    teamName: state.teamName,
    competition: state.competition,
    dbuPoolId: state.dbuPoolId,
    dbuTeamId: state.dbuTeamId,
    [SPRING_2026_SEED_FLAG]: true,
    [SPRING_2026_ARCHIVE_FLAG]: true,
  };

  assertAutumnUntouched(autumnBefore, next);

  return { state: next, applied: true, reason: null };
}

/** True hvis forårsdata stadig ligger blandet ind i nuværende sæson (eller arkiv mangler). */
export function needsSpring2026ArchiveAction(state) {
  if (state[SPRING_2026_ARCHIVE_FLAG]) return false;
  if (state[SPRING_2026_SEED_FLAG]) return true; // seedet ind i current før arkiv-split
  for (const id of collectSpring2026MatchIds()) {
    if (lookupById(state.votes, id)) return true;
    if (lookupById(state.matchStats, id)?.motmKey) return true;
  }
  // Endnu ikke seedet – knappen skal kunne oprette arkivet første gang.
  return true;
}
