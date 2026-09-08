import { useState } from "react";
import { CLUB, OPEN_MATCH, RECENT_MATCH, SQUAD } from "../data";

export function StemScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [votedFor, setVotedFor] = useState<string | null>(null);

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
        <div className="panel" style={{ marginTop: 8 }}>
          <h3>Sidste kamp</h3>
          <p>
            {RECENT_MATCH.home} – {RECENT_MATCH.away}
          </p>
          <p style={{ marginTop: 6, color: "var(--gold)", fontWeight: 700 }}>
            MOTM: {RECENT_MATCH.motmName}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" key="vote">
      <p className="eyebrow">{CLUB.competition}</p>
      <div className="brand-row">
        <h1 className="brand">MOTM</h1>
        <span className="badge open">
          <span className="dot" />
          Åben nu
        </span>
      </div>
      <p className="lede">Vælg kampens spiller. Ét tryk — én stemme.</p>

      <div className="match-hero">
        <div className="match-meta">{OPEN_MATCH.competition}</div>
        <div className="match-scoreline">
          <div className="team">{OPEN_MATCH.home}</div>
          <div className="vs">VS</div>
          <div className="team right">{OPEN_MATCH.away}</div>
        </div>
        <div className="match-meta">{OPEN_MATCH.kickoff} · Stem inden omklædningen lukker</div>
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
