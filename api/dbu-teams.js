// Vercel serverless-funktion: /api/dbu-teams
// Henter klubbens hold via DBU's officielle API.
// Kræver admin-session. API-nøgle sendes i POST-body (aldrig i query-string).
// Kald: POST /api/dbu-teams  { "apiKey": "..." }

import { requireAdmin, sendUnauthorized } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Brug POST med API-nøgle i body." });
  }
  if (!requireAdmin(req)) return sendUnauthorized(res);

  if (req.query?.apiKey) {
    return res.status(400).json({ error: "Send API-nøgle via POST-body, ikke i URL'en." });
  }

  const apiKey = req.body?.apiKey;
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "Angiv klubbens API-nøgle." });
  }

  try {
    const apiUrl = `https://clubservice.dbu.dk/api/Team?APIKey=${encodeURIComponent(apiKey)}`;
    const apiRes = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!apiRes.ok) {
      return res.status(502).json({ error: `DBU's API svarede med status ${apiRes.status}. Tjek at API-nøglen er korrekt.` });
    }
    const data = await apiRes.json();
    const teams = (Array.isArray(data) ? data : []).map(t => ({
      teamId: t.TeamId,
      teamName: t.TeamName,
      divisionName: t.DivisionName,
      poolId: t.Pool?.PoolId ?? null,
      poolName: t.Pool?.PoolName ?? null,
      rowName: t.Pool?.RowName ?? null,
    }));

    if (!teams.length) {
      return res.status(422).json({ error: "Ingen hold fundet for denne API-nøgle." });
    }

    res.status(200).json({ teams });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ukendt fejl ved kald til DBU's API." });
  }
}
