import { useState } from "react";
import { CLUB, SQUAD } from "../data";
import { useStore } from "../store";

export function StemScreen() {
  const { openMatch, recentRevealed } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);

  if (!openMatch && !votedFor) {
    return (
      <div className="screen" key="empty">
        <p className="eyebrow">{CLUB.competition}</p>
        <div className="brand-row">
          <h1 className="brand">MOTM</h1>
          <span className="badge closed">Ingen åben</span>
        </div>
        <p className="lede">Der er ingen afstemning lige nu.</p>
        <div className="panel">
          <h3>Mangler kampprogram?</h3>
          <p>
            Holdlederen tilføjer kampe under fanen <strong>Kampe</strong> — eller åbner afstemning på en
            eksisterende kamp.
          </p>
        </div>
        {recentRevealed ? (
          <div className="panel" style={{ marginTop: 10 }}>
            <h3>Sidste MOTM</h3>
            <p>
              {recentRevealed.home} – {recentRevealed.away}
            </p>
            <p style={{ marginTop: 6, color: "var(--gold)", fontWeight: 700 }}>
              {recentRevealed.motmName}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (votedFor) {
    return (
      <div className="screen" key="thanks">
        <p className="eyebrow">{CLUB.name}</p>
        <div className="brand-row">
          <h1 className="brand">MOTM</h1>
          <span className="badge closed">Lukket for dig</span>
        </div>
        <div className="thanks">
          <div style={{ fontSize: 40 }} aria-hidden>
            ★
          </div>
          <h2>Tak — stemme gemt</h2>
          <p>Afstemningen er åben for resten af holdet. Resultatet afsløres, når admin lukker.</p>
          <div className="picked">{votedFor}</div>
        </div>
        {recentRevealed ? (
          <div className="panel" style={{ marginTop: 8 }}>
            <h3>Sidste kamp</h3>
            <p>
              {recentRevealed.home} – {recentRevealed.away}
            </p>
            <p style={{ marginTop: 6, color: "var(--gold)", fontWeight: 700 }}>
              MOTM: {recentRevealed.motmName}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const match = openMatch!;

  return (
    <div className="screen" key="vote">
      <p className="eyebrow">{match.competition}</p>
      <div className="brand-row">
        <h1 className="brand">MOTM</h1>
        <span className="badge open">
          <span className="dot" />
          Åben nu
        </span>
      </div>
      <p className="lede">Vælg kampens spiller. Ét tryk — én stemme.</p>

      <div className="match-hero">
        <div className="match-meta">{match.competition}</div>
        <div className="match-scoreline">
          <div className="team">{match.home}</div>
          <div className="vs">VS</div>
          <div className="team right">{match.away}</div>
        </div>
        <div className="match-meta">{match.kickoff} · Stem inden omklædningen lukker</div>
      </div>

      <h2 className="section-title">Truppen</h2>
      <div className="player-list">
        {SQUAD.map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`player-row${isSelected ? " selected" : ""}${selected && !isSelected ? " dimmed" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              <span className="shirt">{p.number}</span>
              <span className="player-meta">
                <span className="name">{p.name}</span>
                <span className="pos">{p.position}</span>
              </span>
              {isSelected ? (
                <span style={{ color: "var(--accent)", fontWeight: 800, fontSize: 13 }}>Valgt</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="vote-cta"
        disabled={!selected}
        onClick={() => {
          const player = SQUAD.find((p) => p.id === selected);
          if (player) setVotedFor(player.name);
        }}
      >
        {selected ? `Stem på ${SQUAD.find((p) => p.id === selected)?.name}` : "Vælg en spiller"}
      </button>
    </div>
  );
}
