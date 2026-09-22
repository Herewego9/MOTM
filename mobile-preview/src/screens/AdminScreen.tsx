import { useState, type FormEvent } from "react";
import { CLUB } from "../data";
import { useStore } from "../store";

export function AdminScreen() {
  const { matches, addMatch, removeMatch, openVoting, closeVoting, seedExample, clearAll, openMatch } =
    useStore();
  const [opponent, setOpponent] = useState("");
  const [isHome, setIsHome] = useState(true);
  const [kickoff, setKickoff] = useState("");
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState("");

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!opponent.trim()) {
      setMsg("Skriv en modstander.");
      return;
    }
    addMatch({
      opponent: opponent.trim(),
      isHome,
      kickoff: kickoff.trim() || "TBA",
    });
    setOpponent("");
    setKickoff("");
    setMsg("Kamp tilføjet.");
  }

  function handleBulk() {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      setMsg("Indsæt mindst én linje: Modstander;Hjemme|Ude;Dato");
      return;
    }
    let n = 0;
    for (const line of lines) {
      const [opp, venue, date] = line.split(";").map((s) => s.trim());
      if (!opp) continue;
      const home = !venue || /^h/i.test(venue);
      addMatch({
        opponent: opp,
        isHome: home,
        kickoff: date || "TBA",
      });
      n += 1;
    }
    setBulk("");
    setMsg(`${n} kampe tilføjet fra listen.`);
  }

  return (
    <div className="screen">
      <p className="eyebrow">Holdleder</p>
      <div className="brand-row">
        <h1 className="brand" style={{ fontSize: 34 }}>
          Kampe
        </h1>
      </div>
      <p className="lede">
        Tilføj kampprogram her. I den rigtige app hentes det fra DBU — her manuelt, så du kan prøve flowet.
      </p>

      <form className="panel admin-form" onSubmit={handleAdd}>
        <h3>Tilføj kamp</h3>
        <label className="field">
          <span>Modstander</span>
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="fx FC Nordhavn"
            autoComplete="off"
          />
        </label>
        <div className="venue-row">
          <button
            type="button"
            className={`chip${isHome ? " on" : ""}`}
            onClick={() => setIsHome(true)}
          >
            Hjemme
          </button>
          <button
            type="button"
            className={`chip${!isHome ? " on" : ""}`}
            onClick={() => setIsHome(false)}
          >
            Ude
          </button>
        </div>
        <label className="field">
          <span>Dato / kickoff</span>
          <input
            value={kickoff}
            onChange={(e) => setKickoff(e.target.value)}
            placeholder="fx Søn 14:00"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="vote-cta" style={{ marginTop: 8 }}>
          Tilføj til kampprogram
        </button>
      </form>

      <div className="panel">
        <h3>Indsæt flere (valgfrit)</h3>
        <p>Én kamp pr. linje: <code>Modstander;Hjemme;Dato</code></p>
        <textarea
          className="bulk-input"
          rows={3}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"BK Vest;Ude;12. apr\nFC Nordhavn;Hjemme;Søn 14:00"}
        />
        <button type="button" className="secondary-cta" onClick={handleBulk}>
          Indsæt liste
        </button>
      </div>

      {msg ? <div className="ok-banner">{msg}</div> : null}

      <div className="admin-tools">
        <button type="button" className="ghost-btn" onClick={seedExample}>
          Udfyld eksempel
        </button>
        <button type="button" className="ghost-btn danger" onClick={clearAll}>
          Ryd alle
        </button>
      </div>

      <h2 className="section-title">Kampprogram · {matches.length}</h2>
      {!matches.length ? (
        <div className="panel">
          <h3>Tomt endnu</h3>
          <p>
            Tilføj første kamp ovenfor — eller tryk “Udfyld eksempel” for at se {CLUB.name} med demo-kampe.
          </p>
        </div>
      ) : (
        <div className="player-list">
          {matches.map((m) => {
            const isOpen = openMatch?.id === m.id;
            return (
              <div key={m.id} className="match-admin-row">
                <div className="player-meta">
                  <span className="name">
                    {m.isHome ? "🏠" : "✈️"} {m.opponent}
                  </span>
                  <span className="pos">
                    {m.kickoff}
                    {m.open ? " · Afstemning åben" : ""}
                    {m.revealed ? ` · MOTM: ${m.motmName || "–"}` : ""}
                  </span>
                </div>
                <div className="match-admin-actions">
                  {!m.revealed && !m.open ? (
                    <button type="button" className="chip on" onClick={() => openVoting(m.id)}>
                      Åbn stemme
                    </button>
                  ) : null}
                  {isOpen ? (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => closeVoting(m.id, "Mikkel Frost")}
                    >
                      Luk & afslør
                    </button>
                  ) : null}
                  <button type="button" className="ghost-btn danger" onClick={() => removeMatch(m.id)}>
                    Slet
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
