import { RANKING } from "../data";

export function RanglisteScreen() {
  const max = RANKING[0]?.points ?? 1;

  return (
    <div className="screen">
      <p className="eyebrow">Sæson 2025/26</p>
      <div className="brand-row">
        <h1 className="brand" style={{ fontSize: 36 }}>
          Rangliste
        </h1>
      </div>
      <p className="lede">MOTM vægter mest — derefter mål og assists.</p>

      {RANKING.map((row, i) => {
        const posClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        const barColor = i === 0 ? "var(--gold)" : i === 1 ? "var(--blue)" : i === 2 ? "#d4a574" : "var(--muted)";
        return (
          <div key={row.name}>
            <div className="rank-row">
              <div className={`rank-pos ${posClass}`}>{i + 1}</div>
              <div>
                <div className={`rank-name${i === 0 ? " top" : ""}`}>{row.name}</div>
                <div className="rank-sub">
                  {row.motm} MOTM · {row.goals} mål · {row.assists} assists
                </div>
              </div>
              <div className="rank-pts">{row.points}</div>
            </div>
            <div className="rank-bar">
              <span
                style={{
                  width: `${Math.round((row.points / max) * 100)}%`,
                  background: barColor,
                }}
              />
            </div>
            {i < RANKING.length - 1 ? <div className="divider" /> : null}
          </div>
        );
      })}
    </div>
  );
}
