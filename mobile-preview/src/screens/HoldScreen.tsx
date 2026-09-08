import { CLUB, LAUNDRY, SQUAD } from "../data";

export function HoldScreen() {
  return (
    <div className="screen">
      <p className="eyebrow">{CLUB.competition}</p>
      <div className="brand-row">
        <h1 className="brand" style={{ fontSize: 36 }}>
          {CLUB.name}
        </h1>
      </div>
      <p className="lede">Trup og vaskerotation — altid på telefonen.</p>

      <div className="panel">
        <h3>Vasketøj denne uge</h3>
        <p>
          <strong style={{ color: "var(--text)" }}>{LAUNDRY.name}</strong> har spilletøjet efter {LAUNDRY.match}.
        </p>
        <p style={{ marginTop: 6 }}>{LAUNDRY.due}</p>
      </div>

      <h2 className="section-title">Truppen · {SQUAD.length}</h2>
      <div className="player-list">
        {SQUAD.map((p) => (
          <div key={p.id} className="player-row" style={{ cursor: "default" }}>
            <span className="shirt">{p.number}</span>
            <span className="player-meta">
              <span className="name">{p.name}</span>
              <span className="pos">{p.position}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
