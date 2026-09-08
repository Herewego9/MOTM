import { useState } from "react";
import { CLUB } from "../data";

export function ProfilScreen() {
  const [pushVote, setPushVote] = useState(true);
  const [pushReveal, setPushReveal] = useState(true);
  const [pushLaundry, setPushLaundry] = useState(false);

  return (
    <div className="screen">
      <p className="eyebrow">Din profil</p>
      <div className="brand-row">
        <h1 className="brand" style={{ fontSize: 36 }}>
          Mikkel
        </h1>
      </div>
      <p className="lede">Spiller på {CLUB.name} · #10</p>

      <div className="panel">
        <h3>Klubkode</h3>
        <p>Del koden, så nye spillere kan joine holdet i appen.</p>
        <div className="code-chip">{CLUB.inviteCode}</div>
      </div>

      <h2 className="section-title">Notifikationer</h2>
      <div className="panel" style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div className="toggle-row">
          <div>
            <h3>Afstemning åben</h3>
            <p>Push når admin starter stemme</p>
          </div>
          <button
            type="button"
            className={`toggle${pushVote ? " on" : ""}`}
            aria-pressed={pushVote}
            onClick={() => setPushVote((v) => !v)}
          />
        </div>
        <div className="toggle-row">
          <div>
            <h3>MOTM afsløret</h3>
            <p>Når resultatet offentliggøres</p>
          </div>
          <button
            type="button"
            className={`toggle${pushReveal ? " on" : ""}`}
            aria-pressed={pushReveal}
            onClick={() => setPushReveal((v) => !v)}
          />
        </div>
        <div className="toggle-row">
          <div>
            <h3>Vaskepligt</h3>
            <p>Påmindelse hvis det er din tur</p>
          </div>
          <button
            type="button"
            className={`toggle${pushLaundry ? " on" : ""}`}
            aria-pressed={pushLaundry}
            onClick={() => setPushLaundry((v) => !v)}
          />
        </div>
      </div>

      <div className="panel">
        <h3>Preview-mode</h3>
        <p>
          Dette er en lokal telefon-prototype med mock-data. Den rører ikke den live MOTM-webapp eller
          databasen.
        </p>
      </div>
    </div>
  );
}
