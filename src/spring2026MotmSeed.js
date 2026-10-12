// Éngangs-seed: MotM-stemmer fra Google Sheet for Forår 2026 (ST 70).
// Kamp-id = DBU kampnr fra https://dbu.dk/resultater/hold/769359_485672/kampprogram

export const SPRING_2026_SEED_FLAG = "spring2026MotmSeeded";

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

/** Merger Forår 2026-stemmer ind i shared state uden at røre mål/assist/kort. */
export function applySpring2026MotmSeed(state) {
  if (state[SPRING_2026_SEED_FLAG]) {
    return { state, applied: false, reason: "already_seeded" };
  }

  const existingById = new Map((state.matches || []).map(m => [String(m.id), m]));
  const matches = [...(state.matches || [])];
  for (const stub of SPRING_2026_MATCHES) {
    if (!existingById.has(String(stub.id))) {
      matches.push(stub);
      existingById.set(String(stub.id), stub);
    }
  }
  matches.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  const votes = { ...(state.votes || {}) };
  const revealed = { ...(state.revealed || {}) };
  const matchStats = { ...(state.matchStats || {}) };

  for (const match of SPRING_2026_MATCHES) {
    const id = match.id;
    const matchVotes = votesFromCounts(SPRING_2026_VOTES_BY_MATCH[id]);
    votes[id] = matchVotes;
    revealed[id] = true;
    const motm = resolveMotm(matchVotes);
    const prev = matchStats[id] || { players: [] };
    matchStats[id] = {
      ...prev,
      players: prev.players || [],
      motmKey: motm.motmKey,
      motmName: motm.motmName,
      motmKeys: motm.motmKeys,
      motmNames: motm.motmNames,
    };
  }

  return {
    state: {
      ...state,
      matches,
      votes,
      revealed,
      matchStats,
      teamName: state.teamName || "ST 70",
      competition: state.competition || "Herrer Serie 5 11:11/9:9 - Forår 2026, Pulje 136",
      dbuTeamId: state.dbuTeamId || "769359",
      dbuPoolId: state.dbuPoolId || "485672",
      [SPRING_2026_SEED_FLAG]: true,
    },
    applied: true,
    reason: null,
  };
}
