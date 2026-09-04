import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ==== UDFYLD DISSE TO MED DINE EGNE SUPABASE-VÆRDIER (Settings > API) ====
// ==== Supabase-nøgler og admin-kode læses fra miljøvariabler, IKKE fra selve koden ====
// Sæt disse i Vercel: Settings → Environment Variables (og lokalt i en .env-fil, som
// aldrig committes til GitHub). Se instruktioner i chatten for hvordan.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// ==========================================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
// Kampdata (stemmer, statistik, m.m.) er DELT mellem alle der bruger appen – ligger i Supabase.
// "Har jeg stemt"-status er PERSONLIG for denne enhed – ligger i localStorage.
// Bemærk: disse er kun INTERNE opbevaringsnøgler i jeres egen Supabase-database –
// de vises aldrig for brugerne og er derfor ikke et branding-problem. De er IKKE
// ændret her, fordi det ville få appen til at miste forbindelsen til jeres allerede
// gemte data (den ville lede efter en ny, tom nøgle i stedet for jeres rigtige data).
const SHARED_KEY = "st70-shared";
const PERSONAL_KEY = "st70-voted-by-me";

const INIT_SHARED = {
  openMatchId: null,
  votes: {},
  revealed: {},
  matchStats: {},
  squadNames: [],
  matches: [], // Tomt som udgangspunkt – hentes ind via Admin → Kampprogram (DBU-link)
  seasonHistory: [], // Arkiverede, afsluttede sæsoner (se ARCHIVE ved RESET/RESET_SEASON)
  laundryHistory: [], // Hvem har haft spilletøjet med hjem til vask, og hvornår
  teamName: null, // Sættes automatisk ud fra DBU-kampprogrammet – ingen hardkodede holdnavne
  competition: null, // Række/turnering, sættes automatisk fra DBU
  dbuApiKey: "", dbuPoolId: "", dbuTeamId: "", // Valgfri officiel DBU API-adgang (mere pålideligt end skrabning)
};
const INIT_PERSONAL = {
  votedMatches: {}, // { matchId: "navn på den spiller jeg stemte på" }
};
const INIT = { ...INIT_SHARED, ...INIT_PERSONAL };

// Ranglistepoint: MOTM tæller mest, derefter mål, derefter assist.
const WEIGHTS = { motm: 5, goal: 3, assist: 2, yellowCard: -1, redCard: -3 };
// Loft for hvor mange point mål+assist maksimalt må give I ÉN KAMP. Sat til motm-1,
// så kampens spiller ALTID får flest point for netop den kamp – uanset hvor mange mål
// en anden spiller scorer. Kort trækkes stadig fra ovenpå, uden loft (straf skal virke fuldt ud).
const MAX_GOAL_ASSIST_POINTS_PER_MATCH = WEIGHTS.motm - 1;

function deriveSeasonStats(matchStats) {
  const out = {};
  Object.values(matchStats).forEach(({ players, motmKey, motmName }) => {
    (players || []).forEach(p => {
      const k = p.name.toLowerCase();
      if (!out[k]) out[k] = { name: p.name, matchesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, motmWins: 0, score: 0 };
      out[k].matchesPlayed += 1;
      out[k].goals       += p.goals || 0;
      out[k].assists     += p.assists || 0;
      out[k].yellowCards += p.yellowCards || 0;
      out[k].redCards    += p.redCards || 0;
      // Point for netop DENNE kamp – loftet, så mål/assist aldrig kan overgå kampens spiller.
      const rawGoalAssist = (p.goals || 0) * WEIGHTS.goal + (p.assists || 0) * WEIGHTS.assist;
      const cappedGoalAssist = Math.min(rawGoalAssist, MAX_GOAL_ASSIST_POINTS_PER_MATCH);
      const cardPenalty = (p.yellowCards || 0) * WEIGHTS.yellowCard + (p.redCards || 0) * WEIGHTS.redCard;
      out[k].score += cappedGoalAssist + cardPenalty;
    });
    if (motmKey) {
      if (!out[motmKey]) out[motmKey] = { name: motmName || motmKey, matchesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, motmWins: 0, score: 0 };
      out[motmKey].motmWins += 1;
      out[motmKey].score += WEIGHTS.motm;
    }
  });
  return out;
}

function scorePlayer(p) {
  return p.score || 0;
}

// ---- Designsystem: "Matchday" – banegrøn nat, scoreboard-typografi ----
const C = {
  bg: "#0a1210", surface: "#121e19", surfaceRaised: "#182720", border: "#25362d",
  accent: "#22c55e", accentDeep: "#15803d", danger: "#ef4444", gold: "#f2b544",
  yellow: "#fde047", blue: "#38bdf8", text: "#f2f5f1", muted: "#8fa396", inputBg: "#0e1815",
};

const F = {
  display: "'Barlow Condensed', 'Inter', system-ui, sans-serif", // overskrifter, tal, scoreboard-følelse
  body: "'Inter', system-ui, -apple-system, sans-serif",
};

const S = {
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "24px", width: "100%", boxSizing: "border-box", marginTop: "14px", boxShadow: "0 4px 18px rgba(0,0,0,0.28)" },
  h2: { fontFamily: F.display, fontSize: "21px", fontWeight: 700, marginBottom: "4px", letterSpacing: "0.2px" },
  label: { display: "block", fontSize: "11px", fontWeight: 700, color: C.muted, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.8px" },
  input: { width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "11px 13px", color: C.text, fontFamily: F.body, fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "12px", transition: "border-color 0.15s, box-shadow 0.15s" },
  btn: (v = "primary", full = true) => ({
    width: full ? "100%" : "auto", padding: full ? "12px" : "8px 14px",
    borderRadius: "9px", border: "none", cursor: "pointer",
    fontFamily: F.body, fontSize: full ? "14px" : "12px", fontWeight: 700, letterSpacing: "0.2px",
    background: v === "primary" ? `linear-gradient(180deg, ${C.accent}, ${C.accentDeep})` : v === "danger" ? "#dc2626" : v === "gold" ? C.gold : v === "warn" ? "#a16207" : C.surfaceRaised,
    color: v === "secondary" ? C.text : v === "gold" ? "#1a1200" : "#fff",
    boxShadow: v === "primary" ? "0 2px 10px rgba(34,197,94,0.25)" : "none",
    marginBottom: 0, whiteSpace: "nowrap", transition: "filter 0.15s, transform 0.1s",
  }),
  err: { color: "#fca5a5", fontSize: "13px", marginBottom: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "9px 12px" },
  ok: { color: "#86efac", fontSize: "13px", marginBottom: "10px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "8px", padding: "9px 12px" },
  badge: (open) => ({ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "20px", letterSpacing: "0.3px", background: open ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)", color: open ? "#4ade80" : "#f87171", border: `1px solid ${open ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)"}` }),
  dot: (open) => ({ width: "6px", height: "6px", borderRadius: "50%", background: open ? "#4ade80" : "#f87171", display: "inline-block", boxShadow: open ? "0 0 6px rgba(74,222,128,0.8)" : "none" }),
};

// Diskret bane-stribetekstur til side-baggrunden – signaturdetaljen, holdt meget svag.
const PITCH_STRIPES = `repeating-linear-gradient(115deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 60px, transparent 60px, transparent 120px)`;

function fmtDate(iso) { return new Date(iso).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" }); }
function isHome(m, teamName) { return !!teamName && m.home === teamName; }
function opponent(m, teamName) { return isHome(m, teamName) ? m.away : m.home; }

// ---- Storage: delt data i Supabase, personlig data i localStorage ----
async function loadSharedFromSupabase() {
  try {
    const { data, error } = await supabase.from("kv_store").select("value, updated_at").eq("key", SHARED_KEY).maybeSingle();
    if (error) throw error;
    if (data && data.value) return { ...INIT_SHARED, ...data.value, _lastUpdated: data.updated_at || null };
  } catch (e) { console.error("Kunne ikke hente delt data:", e); }
  return { ...INIT_SHARED };
}
async function saveSharedToSupabase(shared) {
  const nowIso = new Date().toISOString();
  try {
    const { error } = await supabase.from("kv_store").upsert({ key: SHARED_KEY, value: shared, updated_at: nowIso });
    if (error) throw error;
  } catch (e) { console.error("Kunne ikke gemme delt data:", e); }
  return nowIso;
}

// Formatér et ISO-tidspunkt til dansk tid (håndterer automatisk sommer-/vintertid).
function fmtDanishTime(iso) {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("da-DK", { timeZone: "Europe/Copenhagen", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  } catch (e) { return iso; }
}
function loadPersonal() {
  try {
    const raw = localStorage.getItem(PERSONAL_KEY);
    if (raw) return { ...INIT_PERSONAL, ...JSON.parse(raw) };
  } catch (e) { /* intet gemt endnu */ }
  return { ...INIT_PERSONAL };
}
function savePersonal(personal) {
  try { localStorage.setItem(PERSONAL_KEY, JSON.stringify(personal)); }
  catch (e) { console.error("Kunne ikke gemme personlig data:", e); }
}

// Gemmer et øjebliksbillede af den nuværende sæson i arkivet, før den nulstilles.
// Springes over, hvis der reelt ikke er noget at gemme (tomt kampprogram).
function archiveCurrentSeason(state, label) {
  const hasData = (state.matches && state.matches.length > 0) || Object.keys(state.matchStats || {}).length > 0;
  if (!hasData) return state.seasonHistory || [];
  const snapshot = {
    id: Date.now(),
    label: (label && label.trim()) || `Sæson afsluttet ${fmtDanishTime(new Date().toISOString())}`,
    archivedAt: new Date().toISOString(),
    matches: state.matches,
    votes: state.votes,
    matchStats: state.matchStats,
    revealed: state.revealed,
  };
  const combined = [...(state.seasonHistory || []), snapshot];
  // Gem højst de 2 seneste sæsoner (= ét år, da der er 2 sæsoner pr. år) – ældre slettes automatisk.
  return combined.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)).slice(0, 2);
}

// Beregner hvem der stadig mangler at have vasketøjet med i den aktuelle "runde".
// Går baglæns gennem historikken og samler navne op, indtil enten hele truppen er
// dækket (en runde er lige afsluttet), eller et navn går igen (vi er passeret
// grænsen til en tidligere runde). Er alle allerede dækket, starter en ny runde
// automatisk, og hele truppen er igen med i lodtrækningen.
// Samler kendte spillernavne fra ALLE steder i appen, ikke kun Trup-listen: kampstatistik
// (mål/assist/kort) og MOTM-stemmer. Så virker vasketøjs-lodtrækningen selvom Trup aldrig
// bliver udfyldt – den bruger simpelthen alle, der reelt er registreret et sted i appen.
function collectKnownPlayers(state) {
  const names = new Map(); // lowercase → visningsnavn (først fundne stavning bevares)
  (state.squadNames || []).forEach(n => { if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n); });
  Object.values(state.matchStats || {}).forEach(md => {
    (md.players || []).forEach(p => { if (!names.has(p.name.toLowerCase())) names.set(p.name.toLowerCase(), p.name); });
  });
  Object.values(state.votes || {}).forEach(mv => {
    Object.values(mv).forEach(entry => { if (!names.has(entry.name.toLowerCase())) names.set(entry.name.toLowerCase(), entry.name); });
  });
  return [...names.values()].sort((a, b) => a.localeCompare(b, "da"));
}

function computeLaundryPool(squadNames, laundryHistory, excludeName) {
  if (!squadNames || !squadNames.length) return [];
  // Kampens spiller for den valgte kamp må ikke selv kunne trækkes til vasketøj den gang.
  const eligibleSquad = excludeName ? squadNames.filter(n => n.toLowerCase() !== excludeName.toLowerCase()) : squadNames;
  if (!eligibleSquad.length) return [];
  const sorted = [...(laundryHistory || [])].sort((a, b) => b.date.localeCompare(a.date));
  const recent = new Set();
  for (const entry of sorted) {
    if (recent.has(entry.name)) break; // ramt en tidligere runde – stop her
    recent.add(entry.name);
    if (recent.size >= eligibleSquad.length) break; // alle kvalificerede er lige dækket
  }
  const pool = eligibleSquad.filter(n => !recent.has(n));
  return pool.length ? pool : eligibleSquad; // alle (undtagen MVP) har haft en tur → ny runde starter
}

// ============================================================
// REDUCER
// ============================================================
function reducer(state, action) {
  switch (action.type) {
    case "VOTE": {
      // Ekstra sikkerhed: stemmer ikke, hvis denne enhed allerede har stemt på kampen.
      if (state.votedMatches[action.matchId]) return state;
      const prev = state.votes[action.matchId] || {};
      const key = action.player.toLowerCase();
      // Gemmer det navn, der først blev brugt for denne spiller, så det vises korrekt
      // (fx "Shahrouz Rafiie"), selvom stemmer altid tælles case-insensitivt internt.
      const prevEntry = prev[key];
      const entry = { count: (prevEntry?.count || 0) + 1, name: prevEntry?.name || action.player };
      return {
        ...state,
        votes: { ...state.votes, [action.matchId]: { ...prev, [key]: entry } },
        votedMatches: { ...state.votedMatches, [action.matchId]: action.player },
      };
    }
    case "ADMIN_VOTE": {
      // Bruges når admin stemmer PÅ VEGNE AF en spiller uden link/mobil.
      // Springer bevidst enheds-spærren (votedMatches) over – den gælder kun
      // almindelige stemmer afgivet fra spillerens egen telefon.
      const prev = state.votes[action.matchId] || {};
      const key = action.player.toLowerCase();
      const prevEntry = prev[key];
      const entry = { count: (prevEntry?.count || 0) + 1, name: prevEntry?.name || action.player };
      return { ...state, votes: { ...state.votes, [action.matchId]: { ...prev, [key]: entry } } };
    }
    case "EDIT_VOTE": {
      // Admin retter/samler en fejlstavet stemme. Skriver man et navn der allerede
      // har stemmer, FLETTES de to sammen (tæller lægges sammen). Skriver man et nyt
      // navn, omdøbes stemmen bare til det.
      const { matchId, oldKey, newName } = action;
      const prev = state.votes[matchId] || {};
      const oldEntry = prev[oldKey];
      if (!oldEntry) return state;
      const newKey = newName.trim().toLowerCase();
      if (!newKey) return state;
      const next = { ...prev };
      delete next[oldKey];
      if (newKey === oldKey) {
        next[newKey] = { ...oldEntry, name: newName.trim() };
      } else {
        const existing = next[newKey];
        next[newKey] = { count: (existing?.count || 0) + oldEntry.count, name: existing?.name || newName.trim() };
      }
      // Er kampen allerede afsluttet, kan rettelsen ændre hvem der reelt har flest
      // stemmer – genberegn derfor vinderen, så statistikken forbliver korrekt.
      let matchStats = state.matchStats;
      if (state.revealed[matchId]) {
        const sorted = Object.entries(next).sort((a, b) => b[1].count - a[1].count);
        const prevMatchData = matchStats[matchId] || { players: [] };
        matchStats = { ...matchStats, [matchId]: { ...prevMatchData, motmKey: sorted[0]?.[0] || null, motmName: sorted[0]?.[1]?.name || null } };
      }
      return { ...state, votes: { ...state.votes, [matchId]: next }, matchStats };
    }
    case "OPEN_MATCH":
      return { ...state, openMatchId: action.matchId };
    case "CLOSE_MATCH": {
      const matchVotes = state.votes[action.matchId] || {};
      const sorted = Object.entries(matchVotes).sort((a, b) => b[1].count - a[1].count);
      const motmKey = sorted.length > 0 ? sorted[0][0] : null;
      const motmName = sorted.length > 0 ? sorted[0][1].name : null;
      const prevMatchData = state.matchStats[action.matchId] || { players: [] };
      return { ...state, openMatchId: null, revealed: { ...state.revealed, [action.matchId]: true }, matchStats: { ...state.matchStats, [action.matchId]: { ...prevMatchData, motmKey, motmName } } };
    }
    case "RESET_VOTES": {
      const newVotes = { ...state.votes };
      delete newVotes[action.matchId];
      const newVoted = { ...state.votedMatches };
      delete newVoted[action.matchId]; // denne enhed må gerne stemme igen
      const prevMatchData = state.matchStats[action.matchId] || { players: [] };
      return { ...state, openMatchId: state.openMatchId === action.matchId ? null : state.openMatchId, revealed: { ...state.revealed, [action.matchId]: false }, votes: newVotes, votedMatches: newVoted, matchStats: { ...state.matchStats, [action.matchId]: { ...prevMatchData, motmKey: null } } };
    }
    case "RESET_MATCH": {
      const newVotes = { ...state.votes }; delete newVotes[action.matchId];
      const newRevealed = { ...state.revealed }; delete newRevealed[action.matchId];
      const newMatchStats = { ...state.matchStats }; delete newMatchStats[action.matchId];
      const newVoted = { ...state.votedMatches }; delete newVoted[action.matchId];
      return { ...state, openMatchId: state.openMatchId === action.matchId ? null : state.openMatchId, votes: newVotes, revealed: newRevealed, matchStats: newMatchStats, votedMatches: newVoted };
    }
    case "UPSERT_PLAYER": {
      const { matchId, player } = action;
      const prevData = state.matchStats[matchId] || { players: [], motmKey: null };
      const key = player.name.toLowerCase();
      const exists = prevData.players.some(p => p.name.toLowerCase() === key);
      const newPlayers = exists ? prevData.players.map(p => p.name.toLowerCase() === key ? { ...p, ...player } : p) : [...prevData.players, player];
      return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: newPlayers } } };
    }
    case "RENAME_AND_UPSERT_PLAYER": {
      // Bruges når admin retter en spillers NAVN under redigering (fx "Ukendt spiller" → korrekt navn).
      // Fjerner den gamle række og opdaterer/opretter den nye i ét samlet trin.
      const { matchId, oldKey, player } = action;
      const prevData = state.matchStats[matchId] || { players: [], motmKey: null };
      const newKey = player.name.toLowerCase();
      if (oldKey === newKey) {
        const newPlayers = prevData.players.map(p => p.name.toLowerCase() === oldKey ? { ...p, ...player } : p);
        return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: newPlayers } } };
      }
      let newPlayers = prevData.players.filter(p => p.name.toLowerCase() !== oldKey);
      const existingIdx = newPlayers.findIndex(p => p.name.toLowerCase() === newKey);
      if (existingIdx >= 0) {
        // Flettes ind i en eksisterende spiller i samme kamp – læg tallene sammen i
        // stedet for at overskrive, så ingen registreret statistik går tabt.
        const ex = newPlayers[existingIdx];
        newPlayers[existingIdx] = {
          name: ex.name,
          goals: (ex.goals || 0) + (player.goals || 0),
          assists: (ex.assists || 0) + (player.assists || 0),
          yellowCards: (ex.yellowCards || 0) + (player.yellowCards || 0),
          redCards: (ex.redCards || 0) + (player.redCards || 0),
        };
      } else {
        newPlayers = [...newPlayers, player];
      }
      return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: newPlayers } } };
    }
    case "UPSERT_PLAYERS": {
      // Ligesom UPSERT_PLAYER, men opdaterer flere spillere i ÉT trin (ét dispatch,
      // ét Supabase-gem). Undgår race condition ved mange enkeltvise dispatch-kald
      // i træk, som kunne få nogle spillere til at "forsvinde" igen.
      const { matchId, players } = action;
      const prevData = state.matchStats[matchId] || { players: [], motmKey: null };
      let newPlayers = [...prevData.players];
      players.forEach(player => {
        const key = player.name.toLowerCase();
        const idx = newPlayers.findIndex(p => p.name.toLowerCase() === key);
        if (idx >= 0) newPlayers[idx] = { ...newPlayers[idx], ...player };
        else newPlayers.push(player);
      });
      return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: newPlayers } } };
    }
    case "DELETE_PLAYER": {
      const { matchId, playerKey } = action;
      const prevData = state.matchStats[matchId] || { players: [], motmKey: null };
      return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: prevData.players.filter(p => p.name.toLowerCase() !== playerKey) } } };
    }
    case "SET_SQUAD":
      return { ...state, squadNames: [...action.names].sort((a, b) => a.localeCompare(b, "da")) };
    case "SET_DBU_API_SETTINGS":
      return { ...state, dbuApiKey: action.apiKey || "", dbuPoolId: action.poolId || "", dbuTeamId: action.teamId || "" };
    case "SET_MATCHES":
      // Bruges ved opdatering INDEN FOR samme sæson – fx et tidspunkt der ændres.
      // Stemmer/statistik rører vi ikke, de er koblet til kampens DBU-nummer.
      return { ...state, matches: action.matches, teamName: action.teamName || state.teamName, competition: action.competition || state.competition };
    case "RESET_SEASON": {
      // Bruges ved en HELT NY sæson – nyt kampprogram, og alt gammelt data
      // (stemmer, statistik, åben afstemning) nulstilles bevidst. Den afsluttede
      // sæson arkiveres først, så man altid kan slå gamle tal op senere.
      const archive = archiveCurrentSeason(state, action.label);
      return { ...state, matches: action.matches, votes: {}, revealed: {}, matchStats: {}, openMatchId: null, seasonHistory: archive, teamName: action.teamName || state.teamName, competition: action.competition || state.competition };
    }
    case "DELETE_SEASON":
      return { ...state, seasonHistory: (state.seasonHistory || []).filter(s => String(s.id) !== String(action.id)) };
    case "ASSIGN_LAUNDRY":
      return { ...state, laundryHistory: [...(state.laundryHistory || []), { id: Date.now(), name: action.name, date: new Date().toISOString(), matchId: action.matchId || null, matchLabel: action.matchLabel || null }] };
    case "DELETE_LAUNDRY_ENTRY":
      return { ...state, laundryHistory: (state.laundryHistory || []).filter(e => String(e.id) !== String(action.id)) };
    case "IMPORT_STATE":
      return { ...INIT, ...action.state };
    case "RESET": {
      const archive = archiveCurrentSeason(state, action.label);
      return { ...INIT, seasonHistory: archive };
    }
    default:
      return state;
  }
}

// ============================================================
// VOTE VIEW
// ============================================================
function VoteView({ state, dispatch }) {
  const { openMatchId, revealed, votedMatches } = state;
  const match = state.matches.find(m => m.id === openMatchId);
  const [playerName, setPlayerName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { setPlayerName(""); setErr(""); }, [openMatchId]);

  // Persisteret status – overlever faneskift og genindlæsning af siden.
  const alreadyVotedFor = openMatchId ? votedMatches[openMatchId] : null;

  function handleVote() {
    if (!playerName.trim()) { setErr("Skriv navnet på kampens MVP."); return; }
    dispatch({ type: "VOTE", matchId: openMatchId, player: playerName.trim() });
  }

  // Spillertruppen vises altid i alfabetisk rækkefølge (ikke statistik-relateret).
  const squad = [...(state.squadNames || [])].sort((a, b) => a.localeCompare(b, "da"));

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontFamily: F.display, fontSize: "26px", fontWeight: 800, letterSpacing: "0.3px", marginBottom: "2px" }}>🏆 Kampens Spiller 🏆</div>
        <div style={{ color: C.muted, fontSize: "12px" }}>{[state.teamName, state.competition].filter(Boolean).join(" · ") || "Hent kampprogram i Admin for at komme i gang"}</div>
      </div>

      {!openMatchId ? (
        <div style={S.card}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "34px", marginBottom: "10px" }}>🔒</div>
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "5px" }}>Ingen aktiv afstemning</div>
            <div style={{ color: C.muted, fontSize: "13px" }}>Admin åbner afstemningen efter kampen.</div>
          </div>
        </div>
      ) : alreadyVotedFor ? (
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: "42px", marginBottom: "10px" }}>✅</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "5px" }}>Du har allerede stemt</div>
          <div style={{ color: C.muted, fontSize: "13px" }}>
            Du stemte på <strong style={{ color: C.text, textTransform: "capitalize" }}>{alreadyVotedFor}</strong> til denne kamp. Man kan kun stemme én gang.
          </div>
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
            <div>
              <div style={S.h2}>{isHome(match, state.teamName) ? `${state.teamName} vs ` : ""}{opponent(match, state.teamName)}{!isHome(match, state.teamName) ? " (ude)" : " (hjemme)"}</div>
              <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px" }}>{fmtDate(match.date)} · {match.time} · {match.venue}</div>
            </div>
            <div style={S.badge(true)}><span style={S.dot(true)} /> Åben</div>
          </div>
          {err && <div style={S.err}>{err}</div>}
          <label style={{ ...S.label, fontSize: "16px" }}>Hvem er kampens MVP ⭐?</label>
          {squad.length > 0 ? (
            <select style={S.input} value={playerName} onChange={e => { setPlayerName(e.target.value); setErr(""); }}>
              <option value="">— Vælg spiller —</option>
              {squad.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input style={S.input} placeholder="Fx Anders Nielsen" value={playerName} onChange={e => { setPlayerName(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && handleVote()} />
          )}
          <button style={S.btn("primary")} onClick={handleVote}>Afgiv stemme ⭐</button>
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Kampprogram</div>
        {state.matches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "16px 0", color: C.muted, fontSize: "13px" }}>Intet kampprogram endnu. Admin kan hente det under Admin → Kampprogram.</div>
        ) : state.matches.map(m => {
          const isActive = m.id === openMatchId;
          const done = revealed[m.id];
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 11px", borderRadius: "7px", marginBottom: "5px", background: isActive ? "rgba(34,197,94,0.08)" : "transparent", border: isActive ? "1px solid rgba(74,222,128,0.25)" : `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", color: C.muted, width: "66px", flexShrink: 0 }}>{fmtDate(m.date)}</div>
              <div style={{ flex: 1, fontSize: "13px", fontWeight: 500 }}>{isHome(m, state.teamName) ? "🏠 " : "✈️ "}{opponent(m, state.teamName)}</div>
              <div style={{ fontSize: "11px", color: done ? "#4ade80" : isActive ? "#4ade80" : C.muted, fontWeight: isActive ? 700 : 400 }}>{done ? "✓" : isActive ? "● Åben" : m.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STATS VIEW (public, fuld tabel)
// ============================================================
// ============================================================
// SÆSON-VÆLGER (bruges af Statistik og Rangliste)
// ============================================================
function SeasonSelector({ state, selectedId, onChange }) {
  const history = state.seasonHistory || [];
  if (!history.length) return null; // ingen arkiverede sæsoner endnu – ingen grund til at vise vælgeren
  return (
    <div style={{ marginBottom: "14px" }}>
      <select style={{ ...S.input, marginBottom: 0 }} value={selectedId} onChange={e => onChange(e.target.value)}>
        <option value="current">Nuværende sæson</option>
        {[...history].reverse().map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </div>
  );
}

function StatsView({ state }) {
  const [selectedId, setSelectedId] = useState("current");
  const archived = selectedId !== "current" ? (state.seasonHistory || []).find(s => String(s.id) === String(selectedId)) : null;
  const matchStatsSource = archived ? archived.matchStats : state.matchStats;

  const seasonStats = deriveSeasonStats(matchStatsSource);
  const players = Object.values(seasonStats).sort((a, b) => b.motmWins - a.motmWins || b.goals - a.goals || b.assists - a.assists);
  const cols = [
    { label: "Kampe", key: "matchesPlayed", emoji: "⚽" },
    { label: "Mål", key: "goals", emoji: "🥅" },
    { label: "Assist", key: "assists", emoji: "🎯" },
    { label: "Gult", key: "yellowCards", emoji: "🟨" },
    { label: "Rødt", key: "redCards", emoji: "🟥" },
    { label: "MOTM", key: "motmWins", emoji: "⭐" },
  ];

  return (
    <div>
      <SeasonSelector state={state} selectedId={selectedId} onChange={setSelectedId} />
      {!players.length ? (
        <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Ingen statistik {archived ? "for denne sæson" : "endnu"}.</div></div>
      ) : (
        <div style={S.card}>
          <div style={{ fontFamily: F.display, fontSize: "20px", fontWeight: 800, letterSpacing: "0.2px", marginBottom: "14px" }}>{archived ? archived.label : "Sæsonstatistik"}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "7px 8px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>Spiller</th>
                  {cols.map(c => (
                    <th key={c.key} style={{ textAlign: "center", padding: "7px 4px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}`, verticalAlign: "bottom" }} title={c.label}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", lineHeight: 1.15 }}>
                        <span style={{ fontSize: "15px" }} aria-hidden="true">{c.emoji}</span>
                        <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.2px", whiteSpace: "nowrap" }}>{c.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.name} style={{ background: i === 0 ? "rgba(242,181,68,0.08)" : "transparent" }}>
                    <td style={{ padding: "8px 8px", fontWeight: i === 0 ? 700 : 500, color: i === 0 ? C.gold : C.text, borderBottom: `1px solid ${C.border}` }}>{i === 0 ? "⭐ " : ""}{p.name}</td>
                    {cols.map(c => <td key={c.key} style={{ textAlign: "center", padding: "8px 5px", borderBottom: `1px solid ${C.border}`, color: (p[c.key] || 0) > 0 ? C.text : C.muted, fontWeight: (p[c.key] || 0) > 0 ? 600 : 400 }}>{p[c.key] || 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// RANKING VIEW (automatisk rangliste)
// ============================================================
function RankingView({ state }) {
  const [selectedId, setSelectedId] = useState("current");
  const archived = selectedId !== "current" ? (state.seasonHistory || []).find(s => String(s.id) === String(selectedId)) : null;
  const matchStatsSource = archived ? archived.matchStats : state.matchStats;

  const seasonStats = deriveSeasonStats(matchStatsSource);
  const players = Object.values(seasonStats)
    .map(p => ({ ...p, score: scorePlayer(p) }))
    .sort((a, b) => b.score - a.score || b.motmWins - a.motmWins || b.goals - a.goals || b.assists - a.assists);

  const medal = i => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
  const maxScore = players[0]?.score || 1;

  return (
    <div>
      <SeasonSelector state={state} selectedId={selectedId} onChange={setSelectedId} />
      {!players.length ? (
        <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Ranglisten opdateres, når der er registreret statistik.</div></div>
      ) : (
        <div style={S.card}>
          <div style={{ fontFamily: F.display, fontSize: "22px", fontWeight: 800, letterSpacing: "0.2px", marginBottom: "4px" }}>🏅 {archived ? archived.label : "Sæsonens rangliste"}</div>
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "18px", lineHeight: 1.6 }}>
            Point: {WEIGHTS.motm} pr. kampens spiller · {WEIGHTS.goal} pr. mål · {WEIGHTS.assist} pr. assist · {WEIGHTS.yellowCard} pr. gult kort · {WEIGHTS.redCard} pr. rødt kort.<br />
            Mål/assist kan højst give {MAX_GOAL_ASSIST_POINTS_PER_MATCH} point i én kamp – kampens spiller-titlen giver derfor altid flest point den kamp.
          </div>
          {players.map((p, i) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 4px", borderBottom: i < players.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={i < 3
                ? { fontSize: "22px", width: "30px", textAlign: "center" }
                : { fontSize: "12px", width: "30px", height: "30px", borderRadius: "50%", background: C.surfaceRaised, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.display }
              }>{medal(i)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.display, fontWeight: i === 0 ? 700 : 600, fontSize: "17px", letterSpacing: "0.2px", color: i === 0 ? C.gold : C.text }}>{p.name}</div>
                <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                  <span>⭐ {p.motmWins}</span><span>🥅 {p.goals}</span><span>🎯 {p.assists}</span>{p.yellowCards > 0 && <span>🟨 {p.yellowCards}</span>}{p.redCards > 0 && <span>🟥 {p.redCards}</span>}
                </div>
                <div style={{ height: "4px", background: C.border, borderRadius: "2px", marginTop: "6px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(p.score / maxScore) * 100}%`, background: i === 0 ? C.gold : i === 1 ? C.blue : i === 2 ? "#c084fc" : C.muted, borderRadius: "2px" }} />
                </div>
              </div>
              <div style={{ fontFamily: F.display, fontSize: "24px", fontWeight: 800, color: i === 0 ? C.gold : C.text, minWidth: "34px", textAlign: "right" }}>{p.score}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN VIEW
// ============================================================
function AdminView({ state, dispatch, statsMatchId, setStatsMatchId, laundryMatchId, setLaundryMatchId }) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [tab, setTab] = useState("matches");
  const [resetLabel, setResetLabel] = useState(`Sæson ${new Date().getFullYear()}`);
  const [resettingAll, setResettingAll] = useState(false);

  if (!authed) return (
    <div style={S.card}>
      <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Admin</div>
      <div style={{ color: C.muted, fontSize: "13px", marginBottom: "18px" }}>Log ind for at styre afstemning og statistik.</div>
      {pwErr && <div style={S.err}>{pwErr}</div>}
      <label style={S.label}>Adgangskode</label>
      <input style={S.input} type="password" placeholder="••••••••" value={pw}
        onChange={e => setPw(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") pw === ADMIN_PASSWORD ? (setAuthed(true), setPwErr("")) : setPwErr("Forkert adgangskode."); }} />
      <button style={S.btn("primary")} onClick={() => pw === ADMIN_PASSWORD ? (setAuthed(true), setPwErr("")) : setPwErr("Forkert adgangskode.")}>Log ind</button>
    </div>
  );

  const tabs = [
    { id: "matches", label: "Kampe", title: "Åbn/luk afstemninger, hent kampprogram, se stemmer" },
    { id: "stats", label: "Kampstat.", title: "Registrér mål, assist og kort pr. kamp" },
    { id: "squad", label: "Trup", title: "Administrer spillerliste" },
    { id: "laundry", label: "Vasketøj", title: "Fair rotation af hvem der har vasketøjet med hjem" },
    { id: "backup", label: "Backup", title: "Eksportér data, se arkiverede sæsoner, gendan backup" },
  ];

  return (
    <div style={S.card}>
      <div style={{ fontFamily: F.display, fontSize: "22px", fontWeight: 800, letterSpacing: "0.2px", marginBottom: "14px" }}>Admin-panel</div>
      <div style={{ display: "flex", gap: "5px", marginBottom: "18px", borderBottom: `1px solid ${C.border}`, paddingBottom: "14px", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} title={t.title} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? "rgba(34,197,94,0.12)" : "transparent", color: tab === t.id ? "#4ade80" : C.muted, border: `1px solid ${tab === t.id ? "rgba(34,197,94,0.35)" : "transparent"}`, borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontFamily: F.body, fontSize: "12px", fontWeight: 700, letterSpacing: "0.2px" }}>{t.label}</button>
        ))}
      </div>

      {tab === "matches" && <MatchesTab state={state} dispatch={dispatch} />}
      {tab === "stats"   && <StatsTab   state={state} dispatch={dispatch} selMatch={statsMatchId} setSelMatch={setStatsMatchId} />}
      {tab === "squad"   && <SquadTab   state={state} dispatch={dispatch} />}
      {tab === "laundry" && <LaundryTab state={state} dispatch={dispatch} matchId={laundryMatchId} setMatchId={setLaundryMatchId} />}
      {tab === "backup"  && <BackupTab  state={state} dispatch={dispatch} />}

      <div style={{ marginTop: "22px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
        {!resettingAll ? (
          <button style={{ ...S.btn("secondary", false), fontSize: "11px", color: C.muted }} onClick={() => setResettingAll(true)}>Nulstil alt data</button>
        ) : (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "8px" }}>Nulstiller kampprogram, stemmer og statistik. Den nuværende sæson arkiveres automatisk (se Statistik/Rangliste).</div>
            <label style={S.label}>Navn på sæsonen der afsluttes</label>
            <input style={S.input} value={resetLabel} onChange={e => setResetLabel(e.target.value)} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{ ...S.btn("danger", false) }} onClick={() => { dispatch({ type: "RESET", label: resetLabel }); setResettingAll(false); }}>Ja, nulstil alt</button>
              <button style={{ ...S.btn("secondary", false) }} onClick={() => setResettingAll(false)}>Fortryd</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- MATCHES TAB ----
function MatchesTab({ state, dispatch }) {
  const [dbuOpen, setDbuOpen] = useState(false);
  const [expandedVotes, setExpandedVotes] = useState(() => new Set());

  function toggleVotes(id) {
    setExpandedVotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: "9px", marginBottom: "16px", overflow: "hidden" }}>
        <button
          title="Hent kampprogrammet fra DBU's hjemmeside, eller opdatér det eksisterende"
          onClick={() => setDbuOpen(o => !o)}
          style={{ width: "100%", textAlign: "left", background: C.bg, border: "none", cursor: "pointer", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", color: C.text, fontSize: "13px", fontWeight: 600 }}
        >
          <span>⚽ Hent/opdatér kampprogram fra DBU</span>
          <span style={{ color: C.muted, fontSize: "12px" }}>{dbuOpen ? "▲ Skjul" : "▼ Vis"}</span>
        </button>
        {dbuOpen && (
          <div style={{ padding: "14px", borderTop: `1px solid ${C.border}` }}>
            <DbuImportTab state={state} dispatch={dispatch} />
          </div>
        )}
      </div>

      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>Åbn afstemning for én kamp ad gangen. Du kan nulstille stemmer uden at miste statistik.</div>
      {state.matches.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Intet kampprogram endnu. Brug boksen ovenfor til at hente det fra DBU.</div>
      )}
      {state.matches.map(m => {
        const isOpen = state.openMatchId === m.id;
        const isRevealed = state.revealed[m.id];
        const totalVotes = Object.values(state.votes[m.id] || {}).reduce((a, b) => a + b.count, 0);
        const hasStats = (state.matchStats[m.id]?.players?.length || 0) > 0;
        const votesExpanded = expandedVotes.has(m.id);
        return (
          <div key={m.id} style={{ border: `1px solid ${isOpen ? "rgba(74,222,128,0.4)" : C.border}`, borderRadius: "9px", padding: "13px 15px", marginBottom: "9px", background: isOpen ? "rgba(34,197,94,0.05)" : "transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>{opponent(m, state.teamName)} {isHome(m, state.teamName) ? "(hj)" : "(ude)"}</div>
                <div style={{ color: C.muted, fontSize: "11px", marginTop: "2px" }}>{fmtDate(m.date)} · {m.time} · {totalVotes} stemme{totalVotes !== 1 ? "r" : ""}{hasStats ? " · stat ✓" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                {!isOpen && !isRevealed && <button title="Åbn afstemning for denne kamp – spillerne kan nu stemme" style={S.btn("primary", false)} onClick={() => dispatch({ type: "OPEN_MATCH", matchId: m.id })}>Åbn</button>}
                {isOpen && <button title="Lukker afstemningen og afslører kampens MVP" style={S.btn("danger", false)} onClick={() => dispatch({ type: "CLOSE_MATCH", matchId: m.id })}>Luk & afslør</button>}
                {isRevealed && <span style={{ fontSize: "11px", color: "#4ade80" }}>✓ Afsluttet</span>}
                {totalVotes > 0 && (
                  <button title="Vis/skjul stemmefordelingen for denne kamp" onClick={() => toggleVotes(m.id)} style={{ ...S.btn("secondary", false), fontSize: "11px" }}>{votesExpanded ? "▲ Skjul stemmer" : "▼ Se stemmer"}</button>
                )}
                <ConfirmButton label="🔄 Nulstil afstemning" title="Sletter kun stemmerne for denne kamp – statistik bevares" style={{ ...S.btn("warn", false), fontSize: "11px" }} onConfirm={() => dispatch({ type: "RESET_VOTES", matchId: m.id })} />
                <ConfirmButton label="🗑 Nulstil kamp" title="Sletter stemmer, statistik og resultat for hele kampen" style={{ ...S.btn("danger", false), fontSize: "11px" }} onConfirm={() => dispatch({ type: "RESET_MATCH", matchId: m.id })} />
              </div>
            </div>
            {votesExpanded && <MatchVotesBreakdown state={state} dispatch={dispatch} matchId={m.id} />}
            {isOpen && <AdminVoteBox state={state} dispatch={dispatch} matchId={m.id} />}
          </div>
        );
      })}
    </div>
  );
}

// Lader admin afgive en stemme PÅ VEGNE AF en spiller uden link/mobil.
// Springer bevidst enheds-spærren over – bruges kun ved undtagelser.
function AdminVoteBox({ state, dispatch, matchId }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);
  const squad = [...(state.squadNames || [])].sort((a, b) => a.localeCompare(b, "da"));

  function submit() {
    if (!name.trim()) return;
    dispatch({ type: "ADMIN_VOTE", matchId, player: name.trim() });
    setMsg({ type: "ok", text: `Stemme registreret for ${name.trim()}.` });
    setName("");
  }

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Stem på vegne af nogen (intet link/mobil)</div>
      {msg && <div style={S.ok}>{msg.text}</div>}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {squad.length > 0 ? (
          <select style={{ ...S.input, marginBottom: 0, flex: "1 1 160px" }} value={name} onChange={e => setName(e.target.value)}>
            <option value="">— Vælg spiller —</option>
            {squad.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <input style={{ ...S.input, marginBottom: 0, flex: "1 1 160px" }} placeholder="Spillernavn" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
        )}
        <button style={{ ...S.btn("primary", false) }} onClick={submit} disabled={!name.trim()}>Afgiv stemme</button>
      </div>
    </div>
  );
}

// ---- STATS TAB ----
function StatsTab({ state, dispatch, selMatch, setSelMatch }) {
  const [form, setForm] = useState({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 });
  const [editingKey, setEditingKey] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const [dbuUrl, setDbuUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");
  const [rawFetch, setRawFetch] = useState(null); // { homeTeam, awayTeam, goals }
  const [side, setSide] = useState(null); // "home" | "away"
  const [suggestion, setSuggestion] = useState(null); // [{minute, scorer, assist, side}]
  const [applyMsg, setApplyMsg] = useState(null);

  // Fald tilbage til første kamp, hvis intet er valgt endnu (fx allerførste besøg i fanen).
  const activeMatch = selMatch ?? state.matches[0]?.id;
  const matchData = state.matchStats[activeMatch] || { players: [] };
  const squad = [...(state.squadNames || [])].sort((a, b) => a.localeCompare(b, "da"));

  function startEdit(p) { setForm({ name: p.name, goals: p.goals, assists: p.assists, yellowCards: p.yellowCards, redCards: p.redCards }); setEditingKey(p.name.toLowerCase()); setErr(""); }
  function handleSave() {
    if (!form.name.trim()) { setErr("Angiv spillernavn."); return; }
    const player = { name: form.name.trim(), goals: +form.goals, assists: +form.assists, yellowCards: +form.yellowCards, redCards: +form.redCards };
    if (editingKey) {
      dispatch({ type: "RENAME_AND_UPSERT_PLAYER", matchId: activeMatch, oldKey: editingKey, player });
    } else {
      dispatch({ type: "UPSERT_PLAYER", matchId: activeMatch, player });
    }
    setForm({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 }); setEditingKey(null);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function handleDelete(playerKey) { dispatch({ type: "DELETE_PLAYER", matchId: activeMatch, playerKey }); }

  async function handleFetchSuggestion() {
    setFetchErr(""); setRawFetch(null); setSuggestion(null); setApplyMsg(null); setSide(null);
    if (!dbuUrl.trim() || !/dbu\.dk/i.test(dbuUrl)) { setFetchErr("Indsæt et gyldigt DBU kampinfo-link."); return; }
    setFetching(true);
    try {
      const res = await fetch(`/api/kampinfo?url=${encodeURIComponent(dbuUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente kampinfo.");
      setRawFetch(data);
      // Gæt hvilket hold der er "vores" ved at se om holdnavnet matcher noget i spillertruppen/kamplisten.
      const match = state.matches.find(m => m.id === activeMatch);
      const guessHome = match && isHome(match, state.teamName);
      setSide(guessHome ? "home" : "away");
    } catch (e) {
      setFetchErr(e.message || "Noget gik galt under hentning.");
    } finally {
      setFetching(false);
    }
  }

  // Når man vælger hold, filtreres forslaget til kun det holds mål (+ ukendte, som skal tjekkes manuelt).
  useEffect(() => {
    if (!rawFetch || !side) { setSuggestion(null); return; }
    setSuggestion(rawFetch.goals.filter(g => g.side === side || g.side === "unknown"));
  }, [rawFetch, side]);

  function swapRow(i) {
    setSuggestion(prev => prev.map((g, idx) => idx === i ? { ...g, scorer: g.assist, assist: g.scorer } : g));
  }
  function removeRow(i) {
    setSuggestion(prev => prev.filter((_, idx) => idx !== i));
  }

  function applySuggestion() {
    if (!suggestion || !suggestion.length) return;
    const tally = {};
    suggestion.forEach(g => {
      if (g.scorer) { tally[g.scorer] = tally[g.scorer] || { name: g.scorer, goals: 0, assists: 0 }; tally[g.scorer].goals += 1; }
      if (g.assist) { tally[g.assist] = tally[g.assist] || { name: g.assist, goals: 0, assists: 0 }; tally[g.assist].assists += 1; }
    });
    const players = Object.values(tally).map(player => {
      const existing = matchData.players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      return { name: player.name, goals: player.goals, assists: player.assists, yellowCards: existing?.yellowCards || 0, redCards: existing?.redCards || 0 };
    });
    dispatch({ type: "UPSERT_PLAYERS", matchId: activeMatch, players });
    setApplyMsg({ type: "ok", text: `${players.length} spillere opdateret ud fra forslaget. Tjek tabellen nedenfor og ret evt. gule/røde kort manuelt.` });
    setRawFetch(null); setSuggestion(null); setSide(null);
    setDbuUrl("");
  }

  const numInput = (key, label) => (
    <div key={key}>
      <label style={S.label}>{label}</label>
      <input style={{ ...S.input, marginBottom: 0, textAlign: "center" }} type="number" min="0" max="20" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );
  if (!state.matches.length) {
    return <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Intet kampprogram endnu. Gå til fanen "Kampprogram" for at hente det fra DBU.</div></div>;
  }

  return (
    <div>
      <label style={S.label}>Kamp</label>
      <select style={S.input} value={selMatch ?? state.matches[0]?.id} onChange={e => { setSelMatch(+e.target.value); setEditingKey(null); setForm({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 }); setSuggestion(null); }}>
        {state.matches.map(m => <option key={m.id} value={m.id}>{fmtDate(m.date)} – {opponent(m, state.teamName)}</option>)}
      </select>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Hent mål/assist-forslag fra DBU</div>
        <div style={{ fontSize: "11px", color: C.muted, marginBottom: "10px", lineHeight: 1.5 }}>Kun til kampe der allerede er afviklet. Dette er et FORSLAG – tjek altid rækkefølgen, før du gemmer. Byt om, hvis scorer/assist står forkert.</div>
        {fetchErr && <div style={S.err}>{fetchErr}</div>}
        {applyMsg && <div style={S.ok}>{applyMsg.text}</div>}
        <input style={S.input} placeholder="https://dbu.dk/resultater/kamp/.../kampinfo" value={dbuUrl} onChange={e => setDbuUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFetchSuggestion()} />
        <button style={S.btn(fetching ? "secondary" : "primary")} onClick={handleFetchSuggestion} disabled={fetching}>{fetching ? "Henter…" : "Hent forslag"}</button>

        {rawFetch && (
          <div style={{ marginTop: "14px", marginBottom: "10px" }}>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "8px" }}>Hvilket hold er jeres? (viser kun mål for det valgte hold)</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{ ...S.btn(side === "home" ? "primary" : "secondary", false) }} onClick={() => setSide("home")}>{rawFetch.homeTeam || "Hjemmehold"}</button>
              <button style={{ ...S.btn(side === "away" ? "primary" : "secondary", false) }} onClick={() => setSide("away")}>{rawFetch.awayTeam || "Udehold"}</button>
            </div>
          </div>
        )}

        {suggestion && (
          <div style={{ marginTop: "14px" }}>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "10px", minWidth: "420px" }}>
              <thead><tr>{["Min.", "Scorer", "Assist", ""].map((h, i) => <th key={i} style={{ textAlign: "left", padding: "5px 6px", color: C.muted, fontSize: "10px", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {suggestion.map((g, i) => (
                  <tr key={i} style={g.side === "unknown" ? { background: "rgba(242,181,68,0.08)" } : undefined}>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>{g.minute ? `'${g.minute}` : "–"}</td>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}` }}>{g.scorer || "– (ukendt, tjek selv)"}</td>
                    <td style={{ padding: "5px 6px", borderBottom: `1px solid ${C.border}`, color: C.muted }}>{g.assist || "–"}</td>
                    <td style={{ padding: "5px 4px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                      {g.assist && <button onClick={() => swapRow(i)} title="Byt scorer og assist om" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.blue, fontSize: "11px", padding: "2px 4px" }}>⇄ byt</button>}
                      <button onClick={() => removeRow(i)} title="Fjern denne linje" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.danger, fontSize: "11px", padding: "2px 4px" }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <button style={{ ...S.btn("primary", false), marginTop: "10px" }} onClick={applySuggestion}>Anvend forslag som statistik</button>
          </div>
        )}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>{editingKey ? "Rediger spiller" : "Tilføj spiller"}</div>
        {editingKey && <div style={{ fontSize: "11px", color: C.muted, marginBottom: "10px", marginTop: "-4px" }}>Du kan også rette navnet. Findes det nye navn allerede i kampen, lægges tallene sammen.</div>}
        {err && <div style={S.err}>{err}</div>}
        <label style={S.label}>Spillernavn</label>
        {squad.length > 0 && !editingKey ? (
          <select style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}>
            <option value="">— Vælg spiller —</option>
            {squad.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <input style={S.input} placeholder="Fx Lars Andersen" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        )}
        <div className="motm-numgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {numInput("goals", "Mål 🥅")}{numInput("assists", "Assist 🎯")}{numInput("yellowCards", "Gult 🟨")}{numInput("redCards", "Rødt 🟥")}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...S.btn(saved ? "secondary" : "primary"), flex: 1 }} onClick={handleSave}>{saved ? "✓ Gemt!" : editingKey ? "Gem ændringer" : "Tilføj spiller"}</button>
          {editingKey && <button style={{ ...S.btn("secondary"), flex: 0, padding: "11px 14px" }} onClick={() => { setEditingKey(null); setForm({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 }); }}>Annuller</button>}
        </div>
      </div>

      {matchData.players.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Registrerede spillere</div>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "380px" }}>
            <thead><tr>{["Spiller", "Mål", "Ast", "🟨", "🟥", ""].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? "left" : "center", padding: "6px 6px", color: C.muted, fontSize: "10px", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {matchData.players.map((p, i) => (
                <tr key={i} style={{ background: editingKey === p.name.toLowerCase() ? "rgba(56,189,248,0.06)" : "transparent" }}>
                  <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}` }}>{p.name}</td>
                  {[p.goals, p.assists, p.yellowCards, p.redCards].map((v, j) => <td key={j} style={{ textAlign: "center", padding: "7px 6px", borderBottom: `1px solid ${C.border}`, color: v > 0 ? C.text : C.muted }}>{v || 0}</td>)}
                  <td style={{ padding: "4px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    <button onClick={() => startEdit(p)} title="Rediger denne spillers tal" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.blue, fontSize: "14px", padding: "8px" }}>✏️</button>
                    <ConfirmButton label="🗑" confirmLabel="Slet" title="Slet denne spiller fra kampens statistik" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.danger, fontSize: "14px", padding: "8px" }} onConfirm={() => handleDelete(p.name.toLowerCase())} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SQUAD TAB ----
function SquadTab({ state, dispatch }) {
  const [input, setInput] = useState((state.squadNames || []).join("\n"));
  const [saved, setSaved] = useState(false);
  const [dbuUrl, setDbuUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState("");
  const [fetchResult, setFetchResult] = useState(null); // { homeTeam, awayTeam, squads }

  function handleSave() { const names = input.split("\n").map(n => n.trim()).filter(Boolean); dispatch({ type: "SET_SQUAD", names }); setSaved(true); setTimeout(() => setSaved(false), 2000); }

  async function handleFetchSquad() {
    setFetchErr(""); setFetchResult(null);
    if (!dbuUrl.trim() || !/dbu\.dk/i.test(dbuUrl)) { setFetchErr("Indsæt et gyldigt DBU kampinfo-link (skal indeholde dbu.dk)."); return; }
    setFetching(true);
    try {
      const res = await fetch(`/api/kampinfo?url=${encodeURIComponent(dbuUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente kampinfo.");
      if (!data.squads || !Object.keys(data.squads).length) throw new Error("Fandt ingen holdopstilling på siden – kampen er måske ikke afviklet endnu.");
      setFetchResult(data);
    } catch (e) {
      setFetchErr(e.message || "Noget gik galt under hentning.");
    } finally {
      setFetching(false);
    }
  }

  // Tilføjer de hentede navne til den frihånds-tekst, du alligevel kan redigere/rette i, før du gemmer.
  function addSquadToInput(names) {
    const existing = input.split("\n").map(n => n.trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...names])];
    setInput(merged.join("\n"));
    setFetchResult(null);
    setDbuUrl("");
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.6 }}>
        Spillertruppen er altid <strong style={{ color: C.text }}>fritekst</strong> nedenfor – du bestemmer selv, om du skriver navne ind i hånden, eller henter dem automatisk fra en DBU kampinfo-side (efter kampen er spillet). Hentede navne tilføjes til listen, du kan altid rette dem bagefter.
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Hent trup fra DBU (valgfrit)</div>
        {fetchErr && <div style={S.err}>{fetchErr}</div>}
        <input style={S.input} placeholder="https://dbu.dk/resultater/kamp/.../kampinfo" value={dbuUrl} onChange={e => setDbuUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFetchSquad()} />
        <button style={S.btn(fetching ? "secondary" : "primary")} onClick={handleFetchSquad} disabled={fetching}>{fetching ? "Henter…" : "Hent hold fra kampen"}</button>

        {fetchResult && (
          <div style={{ marginTop: "14px" }}>
            {Object.entries(fetchResult.squads).map(([teamName, names]) => {
              const sortedNames = [...names].sort((a, b) => a.localeCompare(b, "da"));
              return (
                <div key={teamName} style={{ marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>{teamName} ({sortedNames.length} spillere)</div>
                  <div style={{ fontSize: "11px", color: C.muted, marginBottom: "6px" }}>{sortedNames.join(", ")}</div>
                  <button style={S.btn("primary", false)} onClick={() => addSquadToInput(sortedNames)}>+ Tilføj {teamName} til listen</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <label style={S.label}>Spillertrup ({(state.squadNames || []).length} spillere)</label>
      <textarea style={{ ...S.input, height: "220px", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} placeholder={"Lars Andersen\nMads Jensen\nThomas Nielsen\n..."} value={input} onChange={e => setInput(e.target.value)} />
      <button style={S.btn(saved ? "secondary" : "primary")} onClick={handleSave}>{saved ? "✓ Gemt!" : "Gem trup"}</button>
    </div>
  );
}

// ---- DBU KAMPPROGRAM-IMPORT TAB ----
// Regner ud hvilket hold der er "vores": det eneste hold, der optræder i ALLE
// kampe (modstanderen skifter jo hver gang, men jeres eget hold går igen hver gang).
function detectOwnTeam(matches) {
  const counts = {};
  matches.forEach(m => {
    counts[m.home] = (counts[m.home] || 0) + 1;
    counts[m.away] = (counts[m.away] || 0) + 1;
  });
  const constant = Object.entries(counts).find(([, count]) => count === matches.length);
  return constant ? constant[0] : null;
}

function DbuImportTab({ state, dispatch }) {
  // "api" = officiel DBU API (anbefalet) · "link" = indsæt et DBU-link manuelt
  const [method, setMethod] = useState("api");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // { teamName, competition, matches, source }
  const [selectedTeam, setSelectedTeam] = useState("");
  const [seasonLabel, setSeasonLabel] = useState(`Sæson ${new Date().getFullYear()}`);
  const [confirmingNewSeason, setConfirmingNewSeason] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(null);

  const [apiKey, setApiKey] = useState(state.dbuApiKey || "");
  const hasApiSettings = !!(state.dbuApiKey && state.dbuPoolId && state.dbuTeamId);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [poolId, setPoolId] = useState(state.dbuPoolId || "");
  const [teamId, setTeamId] = useState(state.dbuTeamId || "");

  const [teamList, setTeamList] = useState(null); // [{teamId, teamName, divisionName, poolId, poolName, rowName}]
  const [findingTeams, setFindingTeams] = useState(false);
  const [teamErr, setTeamErr] = useState("");

  // Læser et fetch-svar sikkert som JSON. Hvis serveren fx svarer med en HTML-fejlside
  // (typisk fordi en api-fil mangler eller ikke er lagt korrekt op), får brugeren en
  // forståelig besked i stedet for en rå JavaScript-fejl.
  async function safeReadJson(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Fik et uventet svar fra serveren. Tjek at alle api-filer er lagt korrekt op på GitHub, og prøv igen.");
    }
  }

  async function findMyTeams() {
    setTeamErr(""); setTeamList(null);
    if (!apiKey.trim()) { setTeamErr("Indsæt API-nøglen først."); return; }
    setFindingTeams(true);
    try {
      const res = await fetch(`/api/dbu-teams?apiKey=${encodeURIComponent(apiKey.trim())}`);
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente holdliste.");
      if (data.teams.length === 1) {
        // Kun ét hold på nøglen – ingen grund til at bede brugeren vælge noget.
        pickTeamAndFetch(data.teams[0]);
      } else {
        setTeamList(data.teams);
      }
    } catch (e) {
      setTeamErr(e.message || "Noget gik galt.");
    } finally {
      setFindingTeams(false);
    }
  }

  async function fetchFrom(fetchUrl) {
    setErr(""); setMsg(null); setPreview(null); setSelectedTeam("");
    setLoading(true);
    try {
      const res = await fetch(fetchUrl);
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente kampprogrammet.");
      if (!data.matches || !data.matches.length) throw new Error("Fandt ingen kampe.");
      setPreview(data);
      setSelectedTeam(detectOwnTeam(data.matches) || "");
    } catch (e) {
      setErr(e.message || "Noget gik galt under hentning.");
    } finally {
      setLoading(false);
    }
  }

  // Vælger et hold fra listen: gemmer indstillingerne OG henter kampprogrammet i ét trin.
  function pickTeamAndFetch(t) {
    const newPoolId = String(t.poolId);
    const newTeamId = String(t.teamId);
    setPoolId(newPoolId);
    setTeamId(newTeamId);
    setTeamList(null);
    dispatch({ type: "SET_DBU_API_SETTINGS", apiKey: apiKey.trim(), poolId: newPoolId, teamId: newTeamId });
    fetchFrom(`/api/kampprogram?apiKey=${encodeURIComponent(apiKey.trim())}&poolId=${encodeURIComponent(newPoolId)}&teamId=${encodeURIComponent(newTeamId)}`);
  }

  function saveAdvancedAndFetch() {
    dispatch({ type: "SET_DBU_API_SETTINGS", apiKey: apiKey.trim(), poolId: poolId.trim(), teamId: teamId.trim() });
    fetchFrom(`/api/kampprogram?apiKey=${encodeURIComponent(apiKey.trim())}&poolId=${encodeURIComponent(poolId.trim())}&teamId=${encodeURIComponent(teamId.trim())}`);
  }

  function handleFetchOfficial() {
    if (!hasApiSettings) return;
    fetchFrom(`/api/kampprogram?apiKey=${encodeURIComponent(state.dbuApiKey)}&poolId=${encodeURIComponent(state.dbuPoolId)}&teamId=${encodeURIComponent(state.dbuTeamId)}`);
  }

  function disconnectApi() {
    dispatch({ type: "SET_DBU_API_SETTINGS", apiKey: "", poolId: "", teamId: "" });
    setApiKey(""); setPoolId(""); setTeamId(""); setTeamList(null); setPreview(null);
  }

  function handleFetchLink() {
    if (!url.trim() || !/dbu\.dk/i.test(url)) { setErr("Indsæt et gyldigt DBU-link (skal indeholde dbu.dk)."); return; }
    fetchFrom(`/api/kampprogram?url=${encodeURIComponent(url.trim())}`);
  }

  // Alle holdnavne der optræder i kampene – bruges som valgmuligheder, hvis auto-genkendelsen skal rettes.
  const teamOptions = preview ? [...new Set(preview.matches.flatMap(m => [m.home, m.away]))].sort((a, b) => a.localeCompare(b, "da")) : [];

  function applyImport() {
    if (!preview || !selectedTeam) return;
    // Samme sæson: kampene fra DBU er den "sande" version. Stemmer/statistik rører
    // vi ikke – de er koblet til DBU's kampnummer og forbliver derfor korrekte.
    dispatch({ type: "SET_MATCHES", matches: preview.matches, teamName: selectedTeam, competition: preview.competition });
    setMsg({ type: "ok", text: `Kampprogram opdateret med ${preview.matches.length} kampe. Stemmer og statistik er bevaret.` });
    setPreview(null);
    setUrl("");
  }

  function applyNewSeason() {
    if (!preview || !selectedTeam) return;
    dispatch({ type: "RESET_SEASON", matches: preview.matches, label: seasonLabel, teamName: selectedTeam, competition: preview.competition });
    setMsg({ type: "ok", text: `Ny sæson startet med ${preview.matches.length} kampe. Den gamle sæson er arkiveret.` });
    setPreview(null);
    setUrl("");
    setConfirmingNewSeason(false);
  }

  // Sammenlign ny liste med den nuværende for at vise, hvad der reelt ændrer sig,
  // og for at vurdere om det ligner samme sæson eller en helt ny.
  const diff = preview ? (() => {
    const currentIds = new Set(state.matches.map(m => m.id));
    const newIds = new Set(preview.matches.map(m => m.id));
    const added = preview.matches.filter(m => !currentIds.has(m.id));
    const removed = state.matches.filter(m => !newIds.has(m.id));
    const overlap = preview.matches.filter(m => currentIds.has(m.id));
    const changed = overlap.filter(m => {
      const old = state.matches.find(o => o.id === m.id);
      return old && (old.date !== m.date || old.time !== m.time || old.venue !== m.venue || old.home !== m.home || old.away !== m.away);
    });
    const looksLikeNewSeason = overlap.length === 0 && state.matches.length > 0;
    return { added, removed, changed, overlap, looksLikeNewSeason };
  })() : null;

  const methodBtn = (v, label) => ({
    flex: 1, padding: "9px 10px", borderRadius: "8px", border: `1px solid ${method === v ? "rgba(34,197,94,0.4)" : C.border}`,
    background: method === v ? "rgba(34,197,94,0.12)" : "transparent", color: method === v ? "#4ade80" : C.muted,
    cursor: "pointer", fontFamily: F.body, fontSize: "12px", fontWeight: 700,
  });

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.6 }}>
        Er det <strong style={{ color: C.text }}>samme sæson</strong> (fx en kamp der flytter tidspunkt), bevares al statistik. Er det en <strong style={{ color: C.text }}>helt ny sæson</strong>, kan du vælge at nulstille alt bagefter.
      </div>

      {err && <div style={S.err}>{err}</div>}
      {msg && <div style={S.ok}>{msg.text}</div>}

      {/* ---- Vælg metode ---- */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button style={methodBtn("api")} onClick={() => setMethod("api")}>🔑 Officiel API</button>
        <button style={methodBtn("link")} onClick={() => setMethod("link")}>🔗 Link</button>
      </div>

      {/* ---- Metode: Officiel API ---- */}
      {method === "api" && (
        <div style={S.card}>
          {hasApiSettings ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px rgba(74,222,128,0.8)" }} />
                <span style={{ fontSize: "13px", fontWeight: 700 }}>Forbundet via officielt API</span>
              </div>
              <button style={{ ...S.btn(loading ? "secondary" : "primary"), marginBottom: "10px" }} onClick={handleFetchOfficial} disabled={loading}>{loading ? "Henter…" : "Hent kampprogram"}</button>
              <div style={{ display: "flex", gap: "14px" }}>
                <button onClick={() => { setTeamList(null); dispatch({ type: "SET_DBU_API_SETTINGS", apiKey: state.dbuApiKey, poolId: "", teamId: "" }); }} style={{ background: "transparent", border: "none", color: C.blue, fontSize: "12px", cursor: "pointer", padding: 0 }}>Skift hold</button>
                <button onClick={disconnectApi} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", padding: 0 }}>Fjern forbindelse</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: 1.6 }}>
                Find jeres API-nøgle i KlubOffice under <strong style={{ color: C.text }}>Klubben → "KlubOffice - Data"</strong>. Indsæt kun nøglen – I skal ikke selv lede efter noget hold-id.
              </div>
              <label style={S.label}>API-nøgle</label>
              <input style={S.input} type="password" placeholder="Klubbens API-nøgle" value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === "Enter" && findMyTeams()} />
              {teamErr && <div style={S.err}>{teamErr}</div>}

              {!teamList && (
                <button style={{ ...S.btn(findingTeams ? "secondary" : "primary") }} onClick={findMyTeams} disabled={findingTeams || !apiKey.trim()}>{findingTeams ? "Søger…" : "Find mine hold"}</button>
              )}

              {teamList && (
                <div style={{ marginTop: "4px" }}>
                  <div style={S.label}>Vælg jeres hold</div>
                  {teamList.map(t => (
                    <button
                      key={t.teamId}
                      onClick={() => pickTeamAndFetch(t)}
                      disabled={loading}
                      style={{ display: "block", width: "100%", textAlign: "left", background: C.surfaceRaised, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "11px 12px", marginBottom: "6px", cursor: "pointer", color: C.text }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: 700 }}>{t.teamName} <span style={{ color: C.muted, fontWeight: 400 }}>· {t.divisionName}</span></div>
                      <div style={{ fontSize: "11px", color: C.muted }}>{t.rowName || t.poolName}</div>
                    </button>
                  ))}
                  {loading && <div style={{ fontSize: "12px", color: C.muted }}>Henter kampprogram…</div>}
                </div>
              )}

              <button onClick={() => setAdvancedOpen(o => !o)} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "11px", cursor: "pointer", padding: 0, marginTop: "12px" }}>{advancedOpen ? "▲ Skjul avanceret" : "▼ Indtast Pulje-id/Hold-id manuelt i stedet"}</button>
              {advancedOpen && (
                <div style={{ marginTop: "10px" }}>
                  <label style={S.label}>Pulje-id</label>
                  <input style={S.input} placeholder="Fx 135" value={poolId} onChange={e => setPoolId(e.target.value)} />
                  <label style={S.label}>Hold-id</label>
                  <input style={S.input} placeholder="Fx 502134" value={teamId} onChange={e => setTeamId(e.target.value)} />
                  <button style={S.btn("secondary", false)} onClick={saveAdvancedAndFetch} disabled={!apiKey.trim() || !poolId.trim() || !teamId.trim()}>Gem og hent</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Metode: Link ---- */}
      {method === "link" && (
        <div style={S.card}>
          <label style={S.label}>DBU kampprogram-link</label>
          <input style={S.input} placeholder="https://dbu.dk/resultater/hold/.../kampprogram" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFetchLink()} />
          <button style={S.btn(loading ? "secondary" : "primary")} onClick={handleFetchLink} disabled={loading}>{loading ? "Henter…" : "Hent kampprogram"}</button>
        </div>
      )}

      {preview && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
            {preview.competition ? preview.competition : "Kampprogram"} — {preview.matches.length} kampe fundet {preview.source === "official-api" && <span style={{ color: "#4ade80" }}>· via officielt API</span>}
          </div>

          <label style={S.label}>Jeres hold</label>
          <select style={S.input} value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}>
            <option value="">— Vælg jeres hold —</option>
            {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {!selectedTeam && <div style={{ ...S.err, marginTop: "-6px" }}>Vælg jeres hold, før kampprogrammet kan anvendes – det afgør hvornår I spiller hjemme/ude.</div>}

          {diff.looksLikeNewSeason ? (
            <div style={{ fontSize: "12px", color: C.gold, marginBottom: "10px", background: "rgba(242,181,68,0.1)", border: "1px solid rgba(242,181,68,0.3)", borderRadius: "6px", padding: "10px 12px" }}>
              ⚠️ Ingen af de {preview.matches.length} nye kampe matcher jeres nuværende kampprogram – dette ligner en <strong>ny sæson</strong>.
            </div>
          ) : (
            <>
              {diff.added.length > 0 && <div style={{ fontSize: "12px", color: "#4ade80", marginBottom: "4px" }}>+ {diff.added.length} ny{diff.added.length !== 1 ? "e" : ""} kamp{diff.added.length !== 1 ? "e" : ""}</div>}
              {diff.changed.length > 0 && <div style={{ fontSize: "12px", color: C.gold, marginBottom: "4px" }}>~ {diff.changed.length} kamp{diff.changed.length !== 1 ? "e" : ""} ændret (dato/tid/spillested)</div>}
              {diff.removed.length > 0 && <div style={{ fontSize: "12px", color: C.danger, marginBottom: "4px" }}>− {diff.removed.length} kamp{diff.removed.length !== 1 ? "e" : ""} findes ikke længere på DBU</div>}
              {diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0 && <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Ingen ændringer i forhold til det nuværende kampprogram.</div>}
            </>
          )}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            {!diff.looksLikeNewSeason && (
              <button title="Gemmer det opdaterede kampprogram – eksisterende stemmer/statistik røres ikke" style={S.btn("primary", false)} onClick={applyImport} disabled={!selectedTeam}>Opdatér kampprogram (behold statistik)</button>
            )}
            {!confirmingNewSeason ? (
              <button title="Arkiverer nuværende sæson og starter en helt ny, tom sæson" style={S.btn("danger", false)} onClick={() => setConfirmingNewSeason(true)} disabled={!selectedTeam}>🗑 Dette er en ny sæson – nulstil alt</button>
            ) : (
              <div style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px", marginTop: "4px" }}>
                <div style={{ fontSize: "12px", color: C.muted, marginBottom: "8px" }}>Den nuværende sæson arkiveres automatisk, og alt aktivt data nulstilles.</div>
                <label style={S.label}>Navn på sæsonen der afsluttes</label>
                <input style={S.input} value={seasonLabel} onChange={e => setSeasonLabel(e.target.value)} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button style={S.btn("danger", false)} onClick={applyNewSeason}>Ja, start ny sæson</button>
                  <button style={S.btn("secondary", false)} onClick={() => setConfirmingNewSeason(false)}>Fortryd</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// Genbrugelig stemmefordeling for én kamp (bruges inline i Kampe-fanen)
function MatchVotesBreakdown({ state, dispatch, matchId }) {
  const matchVotes = state.votes[matchId] || {};
  const total = Object.values(matchVotes).reduce((a, b) => a + b.count, 0);
  const sorted = Object.entries(matchVotes).sort((a, b) => b[1].count - a[1].count);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const squad = [...(state.squadNames || [])].sort((a, b) => a.localeCompare(b, "da"));

  function startEdit(key, currentName) {
    setEditingKey(key);
    setEditValue(currentName);
  }
  function saveEdit() {
    if (!editValue.trim()) return;
    dispatch({ type: "EDIT_VOTE", matchId, oldKey: editingKey, newName: editValue.trim() });
    setEditingKey(null);
  }

  if (!sorted.length) return <div style={{ fontSize: "12px", color: C.muted, padding: "8px 0" }}>Ingen stemmer endnu.</div>;
  return (
    <div style={{ paddingTop: "10px" }}>
      <div style={{ fontSize: "10px", color: C.muted, marginBottom: "8px" }}>Fejlstavet? Tryk ✏️ og skriv det korrekte navn – findes navnet allerede, flettes stemmerne automatisk sammen.</div>
      {sorted.map(([key, entry], i) => {
        const pct = total ? Math.round(entry.count / total * 100) : 0;
        if (editingKey === key) {
          return (
            <div key={key} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
              {squad.length > 0 ? (
                <select style={{ ...S.input, marginBottom: 0, flex: 1 }} value={editValue} onChange={e => setEditValue(e.target.value)}>
                  <option value={entry.name}>{entry.name}</option>
                  {squad.filter(n => n.toLowerCase() !== key).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <input style={{ ...S.input, marginBottom: 0, flex: 1 }} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus />
              )}
              <button title="Gem" style={{ ...S.btn("primary", false), fontSize: "11px" }} onClick={saveEdit}>✓</button>
              <button title="Annuller" style={{ ...S.btn("secondary", false), fontSize: "11px" }} onClick={() => setEditingKey(null)}>✕</button>
            </div>
          );
        }
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
            <div style={{ fontSize: "12px", color: i === 0 ? C.gold : C.muted, width: "16px" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12px", fontWeight: i === 0 ? 700 : 500 }}>{entry.name}</div>
              <div style={{ height: "3px", background: i === 0 ? C.gold : C.border, width: `${pct}%`, borderRadius: "2px", marginTop: "3px" }} />
            </div>
            <div style={{ fontSize: "11px", color: C.muted }}>{entry.count} ({pct}%)</div>
            <button title="Ret eller flet denne stemme" onClick={() => startEdit(key, entry.name)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.blue, fontSize: "13px", padding: "6px" }}>✏️</button>
          </div>
        );
      })}
    </div>
  );
}

// ---- VASKETØJ TAB ----
function LaundryTab({ state, dispatch, matchId, setMatchId }) {
  const [candidate, setCandidate] = useState(null);
  const [msg, setMsg] = useState(null);
  const matchesSorted = [...(state.matches || [])].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const activeMatchId = matchId || matchesSorted[0]?.id || "";

  const squad = collectKnownPlayers(state);
  const matchMotmName = state.matchStats[activeMatchId]?.motmName || null;
  const pool = computeLaundryPool(squad, state.laundryHistory, matchMotmName);
  const history = [...(state.laundryHistory || [])].sort((a, b) => b.date.localeCompare(a.date));

  function matchLabelFor(id) {
    const m = state.matches.find(x => x.id === +id);
    return m ? `${fmtDate(m.date)} – ${opponent(m, state.teamName)}` : null;
  }

  function rollRandom() {
    setMsg(null);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setCandidate(pick);
  }

  function confirmAssign() {
    if (!candidate) return;
    dispatch({ type: "ASSIGN_LAUNDRY", name: candidate, matchId: activeMatchId || null, matchLabel: activeMatchId ? matchLabelFor(activeMatchId) : null });
    setMsg({ type: "ok", text: `${candidate} er registreret som denne omgangs vasketøjs-ansvarlig.` });
    setCandidate(null);
  }

  function deleteEntry(id) { dispatch({ type: "DELETE_LAUNDRY_ENTRY", id }); }

  if (!squad.length) {
    return <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Ingen spillere fundet endnu. Udfyld Trup-listen, eller registrér mål/assist/kort eller MOTM-stemmer for en kamp – så bygges listen automatisk.</div></div>;
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.6 }}>
        Trækker tilfældigt en spiller til at tage spilletøjet med hjem til vask. Spillerpuljen bygges automatisk ud fra Trup-listen samt alle, der har mål/assist/kort eller MOTM-stemmer registreret – du behøver altså ikke holde Trup opdateret for at bruge det her. Alle skal have haft en tur, før nogen trækkes igen.
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
          {pool.length} af {squad.length} er stadig med i denne runde
        </div>
        {matchMotmName && <div style={{ fontSize: "11px", color: C.gold, marginBottom: "10px", marginTop: "-6px" }}>⭐ {matchMotmName} er kampens spiller og er fritaget for vasketøj denne gang</div>}

        {matchesSorted.length > 0 && (
          <>
            <label style={S.label}>Kamp (valgfrit, men anbefalet)</label>
            <select style={S.input} value={activeMatchId} onChange={e => setMatchId(e.target.value)}>
              <option value="">— Ingen bestemt kamp —</option>
              {matchesSorted.map(m => <option key={m.id} value={m.id}>{fmtDate(m.date)} – {opponent(m, state.teamName)}</option>)}
            </select>
          </>
        )}

        {msg && <div style={S.ok}>{msg.text}</div>}

        {candidate ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "13px", color: C.muted, marginBottom: "6px" }}>🎲 Trukket:</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: C.gold, marginBottom: "16px" }}>{candidate}</div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
              <button title="Registrerer denne spiller som vasketøjs-ansvarlig" style={S.btn("primary", false)} onClick={confirmAssign}>✓ Bekræft</button>
              <button title="Træk en ny tilfældig spiller i stedet" style={S.btn("secondary", false)} onClick={rollRandom}>🎲 Træk igen</button>
            </div>
          </div>
        ) : (
          <button title="Vælger tilfældigt blandt dem der ikke har haft tøjet med for nylig" style={S.btn("primary")} onClick={rollRandom}>🎲 Træk tilfældig spiller</button>
        )}
      </div>

      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Historik</div>
        {history.length === 0 ? (
          <div style={{ fontSize: "13px", color: C.muted }}>Ingen registreringer endnu.</div>
        ) : (
          history.map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: "7px", border: `1px solid ${C.border}`, marginBottom: "6px", gap: "8px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: "11px", color: C.muted }}>{fmtDanishTime(e.date)}{e.matchLabel ? ` · ${e.matchLabel}` : ""}</div>
              </div>
              <ConfirmButton label="🗑" confirmLabel="Slet" title="Slet denne registrering (bruges ved fejl)" style={{ background: "transparent", border: "none", cursor: "pointer", color: C.danger, fontSize: "14px", padding: "8px", flexShrink: 0 }} onConfirm={() => deleteEntry(e.id)} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Native window.confirm() kan blive permanent blokeret af mobilbrowsere, hvis man
// krydser "husk mit svar" af – derefter svarer den automatisk "nej" for evigt.
// Denne knap bygger bekræftelsen ind i selve appen i stedet, så det aldrig sker.
function ConfirmButton({ label, confirmLabel = "Ja, gør det", style, onConfirm, title }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span style={{ display: "inline-flex", gap: "6px" }}>
        <button title="Bekræft handlingen" style={{ ...S.btn("danger", false), fontSize: "11px" }} onClick={() => { setConfirming(false); onConfirm(); }}>{confirmLabel}</button>
        <button title="Annuller, gør ingenting" style={{ ...S.btn("secondary", false), fontSize: "11px" }} onClick={() => setConfirming(false)}>Fortryd</button>
      </span>
    );
  }
  return <button title={title} style={style} onClick={() => setConfirming(true)}>{label}</button>;
}

function slugify(text) {
  return (text || "kampens-spiller")
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "-")
    .replace(/^-+|-+$/g, "") || "kampens-spiller";
}

function BackupTab({ state, dispatch }) {
  const [msg, setMsg] = useState(null); // { type: "ok"|"err", text }
  const [fileInputKey, setFileInputKey] = useState(0);
  const [pendingImport, setPendingImport] = useState(null); // { fileName, state }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadBlob(JSON.stringify(state, null, 2), `${slugify(state.teamName)}-backup.json`, "application/json");
    setMsg({ type: "ok", text: "backup.json downloadet." });
  }

  function toCsv(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      const s = String(v ?? "");
      return (s.includes(";") || s.includes('"') || s.includes("\n")) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // \uFEFF (BOM) sikrer at æøå vises korrekt, når filen åbnes i Excel.
    return "\uFEFF" + [headers.join(";"), ...rows.map(r => headers.map(h => escape(r[h])).join(";"))].join("\r\n");
  }

  function exportSeasonCsv() {
    const seasonStats = deriveSeasonStats(state.matchStats);
    const rows = Object.values(seasonStats)
      .map(p => ({ Spiller: p.name, Kampe: p.matchesPlayed, "Mål": p.goals, Assist: p.assists, "Gule kort": p.yellowCards, "Røde kort": p.redCards, "Kampens spiller": p.motmWins, Point: scorePlayer(p) }))
      .sort((a, b) => b.Point - a.Point);
    if (!rows.length) { setMsg({ type: "err", text: "Ingen statistik at eksportere endnu." }); return; }
    downloadBlob(toCsv(rows), `${slugify(state.teamName)}-saesonstatistik.csv`, "text/csv;charset=utf-8;");
    setMsg({ type: "ok", text: "Sæsonstatistik downloadet som CSV (åbnes direkte i Excel)." });
  }

  function exportMatchesCsv() {
    const rows = state.matches.map(m => {
      const votes = state.votes[m.id] || {};
      const totalVotes = Object.values(votes).reduce((a, b) => a + b.count, 0);
      const winner = Object.entries(votes).sort((a, b) => b[1].count - a[1].count)[0];
      return { Dato: m.date, Modstander: opponent(m, state.teamName), "Hjemme/ude": isHome(m, state.teamName) ? "Hjemme" : "Ude", "Kampens spiller": winner ? winner[1].name : "", Stemmer: totalVotes };
    });
    downloadBlob(toCsv(rows), `${slugify(state.teamName)}-kampe.csv`, "text/csv;charset=utf-8;");
    setMsg({ type: "ok", text: "Kampresultater downloadet som CSV." });
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        setPendingImport({ fileName: file.name, state: parsed });
      } catch (err) {
        setMsg({ type: "err", text: "Filen kunne ikke læses – tjek at det er en gyldig backup.json." });
      }
      setFileInputKey(k => k + 1);
    };
    reader.readAsText(file);
  }

  function confirmImport() {
    if (!pendingImport) return;
    dispatch({ type: "IMPORT_STATE", state: pendingImport.state });
    setMsg({ type: "ok", text: "Data importeret." });
    setPendingImport(null);
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "10px", lineHeight: 1.6 }}>
        Appen gemmer automatisk hver gang der sker en ændring – intet forsvinder, selvom du lukker vinduet. Brug backup nedenfor hvis du vil have en ekstra kopi eller flytte data til en anden enhed.
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "5px 12px", marginBottom: "16px" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
        Sidst opdateret: <strong style={{ color: C.text, fontWeight: 600 }}>{fmtDanishTime(state._lastUpdated)}</strong>
      </div>

      {msg && <div style={msg.type === "ok" ? S.ok : S.err}>{msg.text}</div>}

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Eksport</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button title="Downloader spillerstatistik som CSV-fil til Excel" style={{ ...S.btn("primary", false) }} onClick={exportSeasonCsv}>📊 Sæsonstatistik (CSV)</button>
          <button title="Downloader kampresultater og MVP-vindere som CSV-fil" style={{ ...S.btn("primary", false) }} onClick={exportMatchesCsv}>📋 Kampresultater (CSV)</button>
          <button title="Downloader en fuld sikkerhedskopi af alt data" style={{ ...S.btn("secondary", false) }} onClick={exportJson}>💾 Download backup.json</button>
        </div>
        <div style={{ fontSize: "11px", color: C.muted, marginTop: "8px" }}>CSV-filer åbnes direkte i Excel, Numbers eller Google Sheets.</div>
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Arkiverede sæsoner ({(state.seasonHistory || []).length}/2)</div>
        {(!state.seasonHistory || state.seasonHistory.length === 0) ? (
          <div style={{ fontSize: "12px", color: C.muted }}>Ingen arkiverede sæsoner endnu.</div>
        ) : (
          [...state.seasonHistory].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)).map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: C.muted }}>Arkiveret {fmtDanishTime(s.archivedAt)}</div>
              </div>
              <ConfirmButton
                label="🗑 Slet"
                confirmLabel="Slet permanent"
                title="Sletter denne arkiverede sæson permanent – kan ikke fortrydes"
                style={{ ...S.btn("danger", false), fontSize: "11px" }}
                onConfirm={() => dispatch({ type: "DELETE_SEASON", id: s.id })}
              />
            </div>
          ))
        )}
        <div style={{ fontSize: "11px", color: C.muted, marginTop: "10px" }}>Der gemmes automatisk højst de 2 seneste sæsoner (= ét år). Ældre slettes automatisk, når en ny arkiveres.</div>
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Gendan fra backup</div>
        <div style={{ fontSize: "11px", color: C.muted, marginBottom: "10px" }}>Vælg en tidligere downloadet backup.json for at gendanne alt data. Overskriver det nuværende data.</div>
        <input key={fileInputKey} type="file" accept="application/json" onChange={handleImport} style={{ fontSize: "12px", color: C.text }} />
        {pendingImport && (
          <div style={{ marginTop: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "12px" }}>
            <div style={{ fontSize: "12px", marginBottom: "10px" }}>Fil valgt: <strong>{pendingImport.fileName}</strong>. Dette overskriver ALT nuværende data. Fortsæt?</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={S.btn("danger", false)} onClick={confirmImport}>Ja, overskriv med filen</button>
              <button style={S.btn("secondary", false)} onClick={() => setPendingImport(null)}>Fortryd</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [view, setView] = useState("vote");
  const [state, setStateRaw] = useState(() => ({ ...INIT_SHARED, ...loadPersonal() }));
  const [ready, setReady] = useState(false);
  const [connError, setConnError] = useState(false);
  // Holdes her (ikke inde i StatsTab/LaundryTab), så det IKKE nulstilles ved faneskift.
  const [statsMatchId, setStatsMatchId] = useState(null);
  const [laundryMatchId, setLaundryMatchId] = useState("");

  // Hent delt data ved opstart + lyt til ændringer fra andre enheder (live).
  useEffect(() => {
    let active = true;
    (async () => {
      const shared = await loadSharedFromSupabase();
      if (!active) return;
      setStateRaw(prev => ({ ...prev, ...shared }));
      setReady(true);
    })();

    const channel = supabase
      .channel("st70-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "kv_store", filter: `key=eq.${SHARED_KEY}` }, (payload) => {
        if (payload.new && payload.new.value) {
          setStateRaw(prev => ({ ...prev, ...payload.new.value, _lastUpdated: payload.new.updated_at || prev._lastUpdated }));
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") setConnError(true);
      });

    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  function dispatch(action) {
    setStateRaw(prev => {
      const next = reducer(prev, action);
      const { votedMatches, _lastUpdated, ...shared } = next;
      savePersonal({ votedMatches });          // personlig – gemmes lokalt med det samme
      saveSharedToSupabase(shared).then(nowIso => {
        setStateRaw(cur => ({ ...cur, _lastUpdated: nowIso }));
      });
      return next;
    });
  }

  const navBtn = (v) => ({
    background: view === v ? "rgba(34,197,94,0.12)" : "transparent", color: view === v ? "#4ade80" : C.muted,
    border: `1px solid ${view === v ? "rgba(34,197,94,0.35)" : "transparent"}`, borderRadius: "8px",
    padding: "7px 15px", cursor: "pointer", fontFamily: F.body, fontSize: "12px", fontWeight: 700, letterSpacing: "0.3px",
  });

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.body, fontSize: "14px", flexDirection: "column", gap: "10px" }}>
        <div>Forbinder til serveren…</div>
        {connError && <div style={{ color: "#f87171", fontSize: "12px", maxWidth: "320px", textAlign: "center" }}>Kunne ikke forbinde til Supabase. Tjek at VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY er sat korrekt under Vercel → Settings → Environment Variables.</div>}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, backgroundImage: PITCH_STRIPES, color: C.text, fontFamily: F.body, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${C.bg}; font-family: 'Inter', system-ui, sans-serif; }
        input:focus,select:focus,textarea:focus { border-color:${C.accent} !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.15); }
        select { appearance:none; }
        /* Forhindrer iOS Safari i at zoome ind automatisk, når man trykker i et felt */
        input, select, textarea { font-size: 16px !important; }
        button { touch-action: manipulation; }
        button:active { transform: translateY(1px); }
        button:not(:disabled):hover { filter: brightness(1.08); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        ::selection { background: rgba(34,197,94,0.35); }
        @media (max-width: 480px) {
          .motm-numgrid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
      <div style={{ width: "100%", background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button title="Stem på kampens MVP" style={navBtn("vote")} onClick={() => setView("vote")}>Stem</button>
          <button title="Se sæsonens samlede point-rangliste" style={navBtn("ranking")} onClick={() => setView("ranking")}>Rangliste</button>
          <button title="Se fuld sæsonstatistik pr. spiller" style={navBtn("stats")} onClick={() => setView("stats")}>Statistik</button>
          <button title="Administrer kampe, statistik, trup og mere" style={navBtn("admin")} onClick={() => setView("admin")}>Admin</button>
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: "600px", padding: "12px 14px 60px" }}>
        {view === "vote"    && <VoteView    state={state} dispatch={dispatch} />}
        {view === "ranking" && <RankingView state={state} />}
        {view === "stats"   && <StatsView   state={state} />}
        {view === "admin"   && <AdminView   state={state} dispatch={dispatch} statsMatchId={statsMatchId} setStatsMatchId={setStatsMatchId} laundryMatchId={laundryMatchId} setLaundryMatchId={setLaundryMatchId} />}
      </div>
    </div>
  );
}
