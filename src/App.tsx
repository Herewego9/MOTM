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
const SHARED_KEY = "st70-shared";
const PERSONAL_KEY = "st70-voted-by-me";

// Kampprogrammet er nu en del af det delte data (kan opdateres fra DBU via Admin → Kampprogram).
// Dette er standardlisten, som bruges indtil nogen henter et opdateret kampprogram.
const DEFAULT_MATCHES = [
  { id: 369198, date: "2026-08-16", time: "14:00", home: "ST 70",               away: "VSK Aarhus (1)",         venue: "Trige Søndergård" },
  { id: 369200, date: "2026-08-24", time: "18:30", home: "Christiansbjerg IF (2)", away: "ST 70",               venue: "Christiansbjerg Idrætsanlæg" },
  { id: 369202, date: "2026-09-03", time: "18:40", home: "Lisbjerg FC",           away: "ST 70",                venue: "Lisbjerg Skole" },
  { id: 369207, date: "2026-09-06", time: "14:00", home: "ST 70",               away: "Fuglebakken KFUM (6)",   venue: "Trige Søndergård" },
  { id: 369210, date: "2026-09-13", time: "12:00", home: "Hasle B (2)",          away: "ST 70",                 venue: "Ellehøjskolen" },
  { id: 369211, date: "2026-09-20", time: "11:00", home: "VSK Aarhus (1)",       away: "ST 70",                 venue: "VSK Aarhus" },
  { id: 369216, date: "2026-09-27", time: "14:00", home: "ST 70",               away: "Christiansbjerg IF (2)", venue: "Trige Søndergård" },
  { id: 369219, date: "2026-10-06", time: "19:00", home: "ST 70",               away: "Lisbjerg FC",            venue: "Trige Søndergård" },
  { id: 369220, date: "2026-10-11", time: "16:00", home: "Fuglebakken KFUM (6)", away: "ST 70",                 venue: "Ellehøjskolen" },
  { id: 369227, date: "2026-10-25", time: "14:00", home: "ST 70",               away: "Hasle B (2)",            venue: "Trige Søndergård" },
];

const INIT_SHARED = {
  openMatchId: null,
  votes: {},
  revealed: {},
  matchStats: {},
  squadNames: [],
  matches: DEFAULT_MATCHES,
};
const INIT_PERSONAL = {
  votedMatches: {}, // { matchId: "navn på den spiller jeg stemte på" }
};
const INIT = { ...INIT_SHARED, ...INIT_PERSONAL };

// Ranglistepoint: MOTM tæller mest, derefter mål, derefter assist.
const WEIGHTS = { motm: 5, goal: 3, assist: 2, yellowCard: -1, redCard: -3 };

function deriveSeasonStats(matchStats) {
  const out = {};
  Object.values(matchStats).forEach(({ players, motmKey, motmName }) => {
    (players || []).forEach(p => {
      const k = p.name.toLowerCase();
      if (!out[k]) out[k] = { name: p.name, matchesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, motmWins: 0 };
      out[k].matchesPlayed += 1;
      out[k].goals       += p.goals || 0;
      out[k].assists     += p.assists || 0;
      out[k].yellowCards += p.yellowCards || 0;
      out[k].redCards    += p.redCards || 0;
    });
    if (motmKey) {
      if (!out[motmKey]) out[motmKey] = { name: motmName || motmKey, matchesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, motmWins: 0 };
      out[motmKey].motmWins += 1;
    }
  });
  return out;
}

function scorePlayer(p) {
  return p.motmWins * WEIGHTS.motm + p.goals * WEIGHTS.goal + p.assists * WEIGHTS.assist
    + (p.yellowCards || 0) * WEIGHTS.yellowCard + (p.redCards || 0) * WEIGHTS.redCard;
}

const C = {
  bg: "#0d1117", surface: "#161b22", border: "#30363d",
  accent: "#238636", danger: "#da3633", gold: "#d4a017",
  blue: "#58a6ff", text: "#e6edf3", muted: "#8b949e", inputBg: "#0d1117",
};

const S = {
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "24px", width: "100%", boxSizing: "border-box", marginTop: "14px" },
  h2: { fontSize: "18px", fontWeight: 700, marginBottom: "4px", letterSpacing: "-0.3px" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: C.muted, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px", color: C.text, fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
  btn: (v = "primary", full = true) => ({
    width: full ? "100%" : "auto", padding: full ? "11px" : "7px 12px",
    borderRadius: "7px", border: "none", cursor: "pointer",
    fontSize: full ? "14px" : "12px", fontWeight: 600,
    background: v === "primary" ? C.accent : v === "danger" ? C.danger : v === "gold" ? C.gold : v === "warn" ? "#9e6a03" : C.border,
    color: "#fff", marginBottom: 0, whiteSpace: "nowrap",
  }),
  err: { color: "#f85149", fontSize: "13px", marginBottom: "10px", background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)", borderRadius: "6px", padding: "8px 12px" },
  ok: { color: "#3fb950", fontSize: "13px", marginBottom: "10px", background: "rgba(63,185,80,0.1)", border: "1px solid rgba(63,185,80,0.3)", borderRadius: "6px", padding: "8px 12px" },
  badge: (open) => ({ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "20px", background: open ? "rgba(35,134,54,0.15)" : "rgba(218,54,51,0.15)", color: open ? "#3fb950" : "#f85149", border: `1px solid ${open ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}` }),
  dot: (open) => ({ width: "6px", height: "6px", borderRadius: "50%", background: open ? "#3fb950" : "#f85149", display: "inline-block" }),
};

function fmtDate(iso) { return new Date(iso).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" }); }
function isHome(m) { return m.home === "ST 70"; }
function opponent(m) { return isHome(m) ? m.away : m.home; }

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
    case "DELETE_PLAYER": {
      const { matchId, playerKey } = action;
      const prevData = state.matchStats[matchId] || { players: [], motmKey: null };
      return { ...state, matchStats: { ...state.matchStats, [matchId]: { ...prevData, players: prevData.players.filter(p => p.name.toLowerCase() !== playerKey) } } };
    }
    case "SET_SQUAD":
      return { ...state, squadNames: [...action.names].sort((a, b) => a.localeCompare(b, "da")) };
    case "SET_MATCHES":
      // Bruges ved opdatering INDEN FOR samme sæson – fx et tidspunkt der ændres.
      // Stemmer/statistik rører vi ikke, de er koblet til kampens DBU-nummer.
      return { ...state, matches: action.matches };
    case "RESET_SEASON":
      // Bruges ved en HELT NY sæson – nyt kampprogram, og alt gammelt data
      // (stemmer, statistik, åben afstemning) nulstilles bevidst.
      return { ...state, matches: action.matches, votes: {}, revealed: {}, matchStats: {}, openMatchId: null };
    case "IMPORT_STATE":
      return { ...INIT, ...action.state };
    case "RESET":
      return { ...INIT };
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
        <div style={{ fontSize: "21px", fontWeight: 800, marginBottom: "2px" }}>🏆 Kampens Spiller</div>
        <div style={{ color: C.muted, fontSize: "12px" }}>ST 70 · Herrer Serie 5 · Efterår 2026</div>
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
              <div style={S.h2}>{isHome(match) ? "ST 70 vs " : ""}{opponent(match)}{!isHome(match) ? " (ude)" : " (hjemme)"}</div>
              <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px" }}>{fmtDate(match.date)} · {match.time} · {match.venue}</div>
            </div>
            <div style={S.badge(true)}><span style={S.dot(true)} /> Åben</div>
          </div>
          {err && <div style={S.err}>{err}</div>}
          <label style={S.label}>Hvem er kampens MVP ⭐?</label>
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
        {state.matches.map(m => {
          const isActive = m.id === openMatchId;
          const done = revealed[m.id];
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 11px", borderRadius: "7px", marginBottom: "5px", background: isActive ? "rgba(35,134,54,0.08)" : "transparent", border: isActive ? "1px solid rgba(63,185,80,0.25)" : `1px solid ${C.border}` }}>
              <div style={{ fontSize: "11px", color: C.muted, width: "66px", flexShrink: 0 }}>{fmtDate(m.date)}</div>
              <div style={{ flex: 1, fontSize: "13px", fontWeight: 500 }}>{isHome(m) ? "🏠 " : "✈️ "}{opponent(m)}</div>
              <div style={{ fontSize: "11px", color: done ? "#3fb950" : isActive ? "#3fb950" : C.muted, fontWeight: isActive ? 700 : 400 }}>{done ? "✓" : isActive ? "● Åben" : m.time}</div>
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
function StatsView({ state }) {
  const seasonStats = deriveSeasonStats(state.matchStats);
  const players = Object.values(seasonStats).sort((a, b) => b.motmWins - a.motmWins || b.goals - a.goals || b.assists - a.assists);
  const cols = [
    { label: "Kampe", key: "matchesPlayed", emoji: "⚽" },
    { label: "Mål", key: "goals", emoji: "🥅" },
    { label: "Assist", key: "assists", emoji: "🎯" },
    { label: "Gult", key: "yellowCards", emoji: "🟨" },
    { label: "Rødt", key: "redCards", emoji: "🟥" },
    { label: "MOTM", key: "motmWins", emoji: "⭐" },
  ];

  if (!players.length) return <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Ingen statistik endnu.</div></div>;

  return (
    <div style={S.card}>
      <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "14px" }}>Sæsonstatistik</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "7px 8px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }}>Spiller</th>
              {cols.map(c => <th key={c.key} style={{ textAlign: "center", padding: "7px 5px", color: C.muted, fontSize: "11px", borderBottom: `1px solid ${C.border}` }} title={c.label}>{c.emoji}</th>)}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.name} style={{ background: i === 0 ? "rgba(212,160,23,0.06)" : "transparent" }}>
                <td style={{ padding: "8px 8px", fontWeight: i === 0 ? 700 : 500, color: i === 0 ? C.gold : C.text, borderBottom: `1px solid ${C.border}` }}>{i === 0 ? "⭐ " : ""}{p.name}</td>
                {cols.map(c => <td key={c.key} style={{ textAlign: "center", padding: "8px 5px", borderBottom: `1px solid ${C.border}`, color: (p[c.key] || 0) > 0 ? C.text : C.muted, fontWeight: (p[c.key] || 0) > 0 ? 600 : 400 }}>{p[c.key] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// RANKING VIEW (automatisk rangliste)
// ============================================================
function RankingView({ state }) {
  const seasonStats = deriveSeasonStats(state.matchStats);
  const players = Object.values(seasonStats)
    .map(p => ({ ...p, score: scorePlayer(p) }))
    .sort((a, b) => b.score - a.score || b.motmWins - a.motmWins || b.goals - a.goals || b.assists - a.assists);

  if (!players.length) return <div style={S.card}><div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: "13px" }}>Ranglisten opdateres, når der er registreret statistik.</div></div>;

  const medal = i => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
  const maxScore = players[0].score || 1;

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>🏅 Sæsonens rangliste</div>
        <div style={{ fontSize: "12px", color: C.muted, marginBottom: "18px" }}>
          Point: {WEIGHTS.motm} pr. kampens spiller · {WEIGHTS.goal} pr. mål · {WEIGHTS.assist} pr. assist · {WEIGHTS.yellowCard} pr. gult kort · {WEIGHTS.redCard} pr. rødt kort
        </div>
        {players.map((p, i) => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 4px", borderBottom: i < players.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: i < 3 ? "20px" : "13px", width: "28px", textAlign: "center", color: i < 3 ? undefined : C.muted, fontWeight: 700 }}>{medal(i)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: i === 0 ? 700 : 600, fontSize: "14px", color: i === 0 ? C.gold : C.text }}>{p.name}</div>
              <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: C.muted, marginTop: "3px" }}>
                <span>⭐ {p.motmWins}</span><span>🥅 {p.goals}</span><span>🎯 {p.assists}</span>{p.yellowCards > 0 && <span>🟨 {p.yellowCards}</span>}{p.redCards > 0 && <span>🟥 {p.redCards}</span>}
              </div>
              <div style={{ height: "4px", background: C.border, borderRadius: "2px", marginTop: "6px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(p.score / maxScore) * 100}%`, background: i === 0 ? C.gold : i === 1 ? C.blue : i === 2 ? "#a855f7" : C.muted, borderRadius: "2px" }} />
              </div>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: i === 0 ? C.gold : C.text, minWidth: "34px", textAlign: "right" }}>{p.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ADMIN VIEW
// ============================================================
function AdminView({ state, dispatch }) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [tab, setTab] = useState("matches");

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

  const tabs = [{ id: "matches", label: "Kampe" }, { id: "stats", label: "Kampstat." }, { id: "squad", label: "Trup" }, { id: "motm", label: "MOTM" }, { id: "dbu", label: "Kampprogram" }, { id: "backup", label: "Backup" }];

  return (
    <div style={S.card}>
      <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "14px" }}>Admin-panel</div>
      <div style={{ display: "flex", gap: "5px", marginBottom: "18px", borderBottom: `1px solid ${C.border}`, paddingBottom: "14px", flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? C.border : "transparent", color: tab === t.id ? C.text : C.muted, border: `1px solid ${tab === t.id ? C.border : "transparent"}`, borderRadius: "6px", padding: "6px 13px", cursor: "pointer", fontSize: "12px", fontWeight: 500 }}>{t.label}</button>
        ))}
      </div>

      {tab === "matches" && <MatchesTab state={state} dispatch={dispatch} />}
      {tab === "stats"   && <StatsTab   state={state} dispatch={dispatch} />}
      {tab === "squad"   && <SquadTab   state={state} dispatch={dispatch} />}
      {tab === "dbu"     && <DbuImportTab state={state} dispatch={dispatch} />}
      {tab === "motm"    && <MotmTab    state={state} />}
      {tab === "backup"  && <BackupTab  state={state} dispatch={dispatch} />}

      <div style={{ marginTop: "22px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
        <button style={{ ...S.btn("secondary", false), fontSize: "11px", color: C.muted }} onClick={() => { if (window.confirm("Nulstil ALT data for hele sæsonen? Lav evt. en backup først under 'Backup'.")) dispatch({ type: "RESET" }); }}>Nulstil alt data</button>
      </div>
    </div>
  );
}

// ---- MATCHES TAB ----
function MatchesTab({ state, dispatch }) {
  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>Åbn afstemning for én kamp ad gangen. Du kan nulstille stemmer uden at miste statistik.</div>
      {state.matches.map(m => {
        const isOpen = state.openMatchId === m.id;
        const isRevealed = state.revealed[m.id];
        const totalVotes = Object.values(state.votes[m.id] || {}).reduce((a, b) => a + b.count, 0);
        const hasStats = (state.matchStats[m.id]?.players?.length || 0) > 0;
        return (
          <div key={m.id} style={{ border: `1px solid ${isOpen ? "rgba(63,185,80,0.4)" : C.border}`, borderRadius: "9px", padding: "13px 15px", marginBottom: "9px", background: isOpen ? "rgba(35,134,54,0.05)" : "transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>{opponent(m)} {isHome(m) ? "(hj)" : "(ude)"}</div>
                <div style={{ color: C.muted, fontSize: "11px", marginTop: "2px" }}>{fmtDate(m.date)} · {m.time} · {totalVotes} stemme{totalVotes !== 1 ? "r" : ""}{hasStats ? " · stat ✓" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                {!isOpen && !isRevealed && <button style={S.btn("primary", false)} onClick={() => dispatch({ type: "OPEN_MATCH", matchId: m.id })}>Åbn</button>}
                {isOpen && <button style={S.btn("danger", false)} onClick={() => dispatch({ type: "CLOSE_MATCH", matchId: m.id })}>Luk & afslør</button>}
                {isRevealed && <span style={{ fontSize: "11px", color: "#3fb950" }}>✓ Afsluttet</span>}
                <button title="Nulstil afstemning – sletter kun stemmer, bevarer statistik" style={{ ...S.btn("warn", false), fontSize: "11px" }} onClick={() => { if (window.confirm("Nulstil stemmer for denne kamp? Statistik bevares.")) dispatch({ type: "RESET_VOTES", matchId: m.id }); }}>🔄 Nulstil afstemning</button>
                <button title="Nulstil hele kampen – sletter stemmer, statistik og resultat" style={{ ...S.btn("danger", false), fontSize: "11px" }} onClick={() => { if (window.confirm("Nulstil HELE kampen? Stemmer, statistik og resultat slettes.")) dispatch({ type: "RESET_MATCH", matchId: m.id }); }}>🗑 Nulstil kamp</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- STATS TAB ----
function StatsTab({ state, dispatch }) {
  const [selMatch, setSelMatch] = useState(state.matches[0]?.id);
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

  const matchData = state.matchStats[selMatch] || { players: [] };
  const squad = [...(state.squadNames || [])].sort((a, b) => a.localeCompare(b, "da"));

  function startEdit(p) { setForm({ name: p.name, goals: p.goals, assists: p.assists, yellowCards: p.yellowCards, redCards: p.redCards }); setEditingKey(p.name.toLowerCase()); setErr(""); }
  function handleSave() {
    if (!form.name.trim()) { setErr("Angiv spillernavn."); return; }
    dispatch({ type: "UPSERT_PLAYER", matchId: selMatch, player: { name: form.name.trim(), goals: +form.goals, assists: +form.assists, yellowCards: +form.yellowCards, redCards: +form.redCards } });
    setForm({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 }); setEditingKey(null);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  function handleDelete(playerKey) { if (window.confirm("Slet spiller fra denne kamp?")) dispatch({ type: "DELETE_PLAYER", matchId: selMatch, playerKey }); }

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
      const match = state.matches.find(m => m.id === selMatch);
      const guessHome = match && isHome(match);
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
    Object.values(tally).forEach(player => {
      const existing = matchData.players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      dispatch({ type: "UPSERT_PLAYER", matchId: selMatch, player: { name: player.name, goals: player.goals, assists: player.assists, yellowCards: existing?.yellowCards || 0, redCards: existing?.redCards || 0 } });
    });
    setApplyMsg({ type: "ok", text: `${Object.keys(tally).length} spillere opdateret ud fra forslaget. Tjek tabellen nedenfor og ret evt. gule/røde kort manuelt.` });
    setRawFetch(null); setSuggestion(null); setSide(null);
    setDbuUrl("");
  }

  const numInput = (key, label) => (
    <div key={key}>
      <label style={S.label}>{label}</label>
      <input style={{ ...S.input, marginBottom: 0, textAlign: "center" }} type="number" min="0" max="20" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div>
      <label style={S.label}>Kamp</label>
      <select style={S.input} value={selMatch} onChange={e => { setSelMatch(+e.target.value); setEditingKey(null); setForm({ name: "", goals: 0, assists: 0, yellowCards: 0, redCards: 0 }); setSuggestion(null); }}>
        {state.matches.map(m => <option key={m.id} value={m.id}>{fmtDate(m.date)} – {opponent(m)}</option>)}
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "10px" }}>
              <thead><tr>{["Min.", "Scorer", "Assist", ""].map((h, i) => <th key={i} style={{ textAlign: "left", padding: "5px 6px", color: C.muted, fontSize: "10px", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
              <tbody>
                {suggestion.map((g, i) => (
                  <tr key={i} style={g.side === "unknown" ? { background: "rgba(212,160,23,0.06)" } : undefined}>
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
            <button style={S.btn("primary", false)} onClick={applySuggestion}>Anvend forslag som statistik</button>
          </div>
        )}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>{editingKey ? "Rediger spiller" : "Tilføj spiller"}</div>
        {err && <div style={S.err}>{err}</div>}
        <label style={S.label}>Spillernavn</label>
        {squad.length > 0 && !editingKey ? (
          <select style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}>
            <option value="">— Vælg spiller —</option>
            {squad.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <input style={{ ...S.input, background: editingKey ? "#1c2128" : C.inputBg }} placeholder="Fx Lars Andersen" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} readOnly={!!editingKey} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead><tr>{["Spiller", "Mål", "Ast", "🟨", "🟥", ""].map((h, i) => <th key={i} style={{ textAlign: i === 0 ? "left" : "center", padding: "6px 6px", color: C.muted, fontSize: "10px", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {matchData.players.map((p, i) => (
                <tr key={i} style={{ background: editingKey === p.name.toLowerCase() ? "rgba(88,166,255,0.05)" : "transparent" }}>
                  <td style={{ padding: "7px 6px", borderBottom: `1px solid ${C.border}` }}>{p.name}</td>
                  {[p.goals, p.assists, p.yellowCards, p.redCards].map((v, j) => <td key={j} style={{ textAlign: "center", padding: "7px 6px", borderBottom: `1px solid ${C.border}`, color: v > 0 ? C.text : C.muted }}>{v || 0}</td>)}
                  <td style={{ padding: "7px 4px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    <button onClick={() => startEdit(p)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.blue, fontSize: "12px", padding: "2px 4px" }}>✏️</button>
                    <button onClick={() => handleDelete(p.name.toLowerCase())} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.danger, fontSize: "12px", padding: "2px 4px" }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
function DbuImportTab({ state, dispatch }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // { teamName, competition, matches }
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(null);

  async function handleFetch() {
    setErr(""); setMsg(null); setPreview(null);
    if (!url.trim() || !/dbu\.dk/i.test(url)) { setErr("Indsæt et gyldigt DBU-link (skal indeholde dbu.dk)."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/kampprogram?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente kampprogrammet.");
      if (!data.matches || !data.matches.length) throw new Error("Fandt ingen kampe på siden.");
      setPreview(data);
    } catch (e) {
      setErr(e.message || "Noget gik galt under hentning.");
    } finally {
      setLoading(false);
    }
  }

  function applyImport() {
    if (!preview) return;
    // Samme sæson: kampene fra DBU er den "sande" version. Stemmer/statistik rører
    // vi ikke – de er koblet til DBU's kampnummer og forbliver derfor korrekte.
    dispatch({ type: "SET_MATCHES", matches: preview.matches });
    setMsg({ type: "ok", text: `Kampprogram opdateret med ${preview.matches.length} kampe. Stemmer og statistik er bevaret.` });
    setPreview(null);
    setUrl("");
  }

  function applyNewSeason() {
    if (!preview) return;
    if (!window.confirm("Start en HELT NY sæson? Alle nuværende stemmer, statistik og åbne afstemninger bliver slettet permanent. Overvej at tage en backup først under Backup-fanen.")) return;
    dispatch({ type: "RESET_SEASON", matches: preview.matches });
    setMsg({ type: "ok", text: `Ny sæson startet med ${preview.matches.length} kampe. Alt gammelt data er nulstillet.` });
    setPreview(null);
    setUrl("");
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

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.6 }}>
        Indsæt linket til jeres holds kampprogram på DBU (fx <code style={{ color: C.blue }}>dbu.dk/resultater/hold/DIT-HOLD-ID/kampprogram</code>). Er det <strong style={{ color: C.text }}>samme sæson</strong> (fx en kamp der flytter tidspunkt), bevares al statistik. Er det en <strong style={{ color: C.text }}>helt ny sæson</strong>, kan du vælge at nulstille alt.
      </div>

      {err && <div style={S.err}>{err}</div>}
      {msg && <div style={S.ok}>{msg.text}</div>}

      <label style={S.label}>DBU kampprogram-link</label>
      <input style={S.input} placeholder="https://dbu.dk/resultater/hold/.../kampprogram" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFetch()} />
      <button style={S.btn(loading ? "secondary" : "primary")} onClick={handleFetch} disabled={loading}>{loading ? "Henter…" : "Hent kampprogram"}</button>

      {preview && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>
            {preview.teamName || "Hold"} {preview.competition ? `· ${preview.competition}` : ""} — {preview.matches.length} kampe fundet
          </div>

          {diff.looksLikeNewSeason ? (
            <div style={{ fontSize: "12px", color: C.gold, marginBottom: "10px", background: "rgba(212,160,23,0.08)", border: "1px solid rgba(212,160,23,0.25)", borderRadius: "6px", padding: "10px 12px" }}>
              ⚠️ Ingen af de {preview.matches.length} nye kampe matcher jeres nuværende kampprogram – dette ligner en <strong>ny sæson</strong>.
            </div>
          ) : (
            <>
              {diff.added.length > 0 && <div style={{ fontSize: "12px", color: "#3fb950", marginBottom: "4px" }}>+ {diff.added.length} ny{diff.added.length !== 1 ? "e" : ""} kamp{diff.added.length !== 1 ? "e" : ""}</div>}
              {diff.changed.length > 0 && <div style={{ fontSize: "12px", color: C.gold, marginBottom: "4px" }}>~ {diff.changed.length} kamp{diff.changed.length !== 1 ? "e" : ""} ændret (dato/tid/spillested)</div>}
              {diff.removed.length > 0 && <div style={{ fontSize: "12px", color: C.danger, marginBottom: "4px" }}>− {diff.removed.length} kamp{diff.removed.length !== 1 ? "e" : ""} findes ikke længere på DBU</div>}
              {diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0 && <div style={{ fontSize: "12px", color: C.muted, marginBottom: "4px" }}>Ingen ændringer i forhold til det nuværende kampprogram.</div>}
            </>
          )}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            {!diff.looksLikeNewSeason && (
              <button style={S.btn("primary", false)} onClick={applyImport}>Opdatér kampprogram (behold statistik)</button>
            )}
            <button style={S.btn("danger", false)} onClick={applyNewSeason}>🗑 Dette er en ny sæson – nulstil alt</button>
          </div>
        </div>
      )}
    </div>
  );
}


function MotmTab({ state }) {
  return (
    <div>
      {state.matches.map(m => {
        const matchVotes = state.votes[m.id] || {};
        const total = Object.values(matchVotes).reduce((a, b) => a + b.count, 0);
        const sorted = Object.entries(matchVotes).sort((a, b) => b[1].count - a[1].count);
        const isRevealed = state.revealed[m.id];
        return (
          <div key={m.id} style={{ border: `1px solid ${C.border}`, borderRadius: "9px", padding: "13px 15px", marginBottom: "9px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px" }}>{opponent(m)} {isHome(m) ? "(hj)" : "(ude)"}</div>
            <div style={{ fontSize: "11px", color: C.muted, marginBottom: sorted.length ? "10px" : 0 }}>{fmtDate(m.date)} · {total} stemme{total !== 1 ? "r" : ""} · {isRevealed ? <span style={{ color: "#3fb950" }}>Afsluttet</span> : "Ikke afsluttet"}</div>
            {sorted.map(([key, entry], i) => {
              const pct = total ? Math.round(entry.count / total * 100) : 0;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <div style={{ fontSize: "12px", color: i === 0 ? C.gold : C.muted, width: "16px" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", fontWeight: i === 0 ? 700 : 500 }}>{entry.name}</div>
                    <div style={{ height: "3px", background: i === 0 ? C.gold : C.border, width: `${pct}%`, borderRadius: "2px", marginTop: "3px" }} />
                  </div>
                  <div style={{ fontSize: "11px", color: C.muted }}>{entry.count} ({pct}%)</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---- BACKUP TAB (Excel-eksport, JSON-backup/-import) ----
function BackupTab({ state, dispatch }) {
  const [msg, setMsg] = useState(null); // { type: "ok"|"err", text }
  const [fileInputKey, setFileInputKey] = useState(0);

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadBlob(JSON.stringify(state, null, 2), "st70-backup.json", "application/json");
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
    downloadBlob(toCsv(rows), "st70-saesonstatistik.csv", "text/csv;charset=utf-8;");
    setMsg({ type: "ok", text: "Sæsonstatistik downloadet som CSV (åbnes direkte i Excel)." });
  }

  function exportMatchesCsv() {
    const rows = state.matches.map(m => {
      const votes = state.votes[m.id] || {};
      const totalVotes = Object.values(votes).reduce((a, b) => a + b.count, 0);
      const winner = Object.entries(votes).sort((a, b) => b[1].count - a[1].count)[0];
      return { Dato: m.date, Modstander: opponent(m), "Hjemme/ude": isHome(m) ? "Hjemme" : "Ude", "Kampens spiller": winner ? winner[1].name : "", Stemmer: totalVotes };
    });
    downloadBlob(toCsv(rows), "st70-kampe.csv", "text/csv;charset=utf-8;");
    setMsg({ type: "ok", text: "Kampresultater downloadet som CSV." });
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!window.confirm("Import overskriver alt nuværende data med indholdet af filen. Fortsæt?")) { setFileInputKey(k => k + 1); return; }
        dispatch({ type: "IMPORT_STATE", state: parsed });
        setMsg({ type: "ok", text: "Data importeret." });
      } catch (err) {
        setMsg({ type: "err", text: "Filen kunne ikke læses – tjek at det er en gyldig backup.json." });
      }
      setFileInputKey(k => k + 1);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "10px", lineHeight: 1.6 }}>
        Appen gemmer automatisk hver gang der sker en ændring – intet forsvinder, selvom du lukker vinduet. Brug backup nedenfor hvis du vil have en ekstra kopi eller flytte data til en anden enhed.
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "5px 12px", marginBottom: "16px" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3fb950", display: "inline-block" }} />
        Sidst opdateret: <strong style={{ color: C.text, fontWeight: 600 }}>{fmtDanishTime(state._lastUpdated)}</strong>
      </div>

      {msg && <div style={msg.type === "ok" ? S.ok : S.err}>{msg.text}</div>}

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Eksport</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button style={{ ...S.btn("primary", false) }} onClick={exportSeasonCsv}>📊 Sæsonstatistik (CSV)</button>
          <button style={{ ...S.btn("primary", false) }} onClick={exportMatchesCsv}>📋 Kampresultater (CSV)</button>
          <button style={{ ...S.btn("secondary", false) }} onClick={exportJson}>💾 Download backup.json</button>
        </div>
        <div style={{ fontSize: "11px", color: C.muted, marginTop: "8px" }}>CSV-filer åbnes direkte i Excel, Numbers eller Google Sheets.</div>
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Gendan fra backup</div>
        <div style={{ fontSize: "11px", color: C.muted, marginBottom: "10px" }}>Vælg en tidligere downloadet backup.json for at gendanne alt data. Overskriver det nuværende data.</div>
        <input key={fileInputKey} type="file" accept="application/json" onChange={handleImport} style={{ fontSize: "12px", color: C.text }} />
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
    background: view === v ? C.border : "transparent", color: view === v ? C.text : C.muted,
    border: `1px solid ${view === v ? C.border : "transparent"}`, borderRadius: "6px",
    padding: "6px 13px", cursor: "pointer", fontSize: "12px", fontWeight: 500,
  });

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", fontSize: "14px", flexDirection: "column", gap: "10px" }}>
        <div>Forbinder til serveren…</div>
        {connError && <div style={{ color: "#f85149", fontSize: "12px", maxWidth: "320px", textAlign: "center" }}>Kunne ikke forbinde til Supabase. Tjek at VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY er sat korrekt under Vercel → Settings → Environment Variables.</div>}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { background:#0d1117; } input:focus,select:focus,textarea:focus { border-color:#58a6ff !important; box-shadow: 0 0 0 3px rgba(88,166,255,0.1); } select { appearance:none; }`}</style>
      <div style={{ width: "100%", background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "7px" }}>⚽ ST 70</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button style={navBtn("vote")} onClick={() => setView("vote")}>Stem</button>
          <button style={navBtn("ranking")} onClick={() => setView("ranking")}>Rangliste</button>
          <button style={navBtn("stats")} onClick={() => setView("stats")}>Statistik</button>
          <button style={navBtn("admin")} onClick={() => setView("admin")}>Admin</button>
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: "600px", padding: "12px 14px 60px" }}>
        {view === "vote"    && <VoteView    state={state} dispatch={dispatch} />}
        {view === "ranking" && <RankingView state={state} />}
        {view === "stats"   && <StatsView   state={state} />}
        {view === "admin"   && <AdminView   state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
}
