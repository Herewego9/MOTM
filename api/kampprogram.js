// Vercel serverless-funktion: /api/kampprogram
// Kræver admin-session. API-nøgle sendes i POST-body (aldrig i query-string).
//   POST { apiKey, poolId, teamId }  → officiel DBU API
//   POST { url } eller GET ?url=...   → skrabning (stadig med admin-token)

import * as cheerio from "cheerio";
import { requireAdmin, sendUnauthorized } from "./_lib/auth.js";

function toDanishDateTime(isoWithOffset) {
  const dt = new Date(isoWithOffset);
  const parts = new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(dt);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

async function fetchOfficial(apiKey, poolId, teamId) {
  const apiUrl = `https://clubservice.dbu.dk/api/TeamMatch?APIKey=${encodeURIComponent(apiKey)}&PoolId=${encodeURIComponent(poolId)}&TeamId=${encodeURIComponent(teamId)}`;
  const apiRes = await fetch(apiUrl, { headers: { Accept: "application/json" } });
  if (!apiRes.ok) {
    const err = new Error(`DBU's officielle API svarede med status ${apiRes.status}. Tjek at API-nøgle, Pulje-id og Hold-id er korrekte.`);
    err.statusCode = 502;
    throw err;
  }
  const data = await apiRes.json();
  const matches = (data.MatchList || []).map(m => {
    const { date, time } = toDanishDateTime(m.MatchDateTime);
    return { id: m.Id, date, time, home: m.HomeTeamName, away: m.AwayTeamName, venue: m.StadiumName || "" };
  });
  if (!matches.length) {
    const err = new Error("DBU's API returnerede ingen kampe. Tjek at Pulje-id og Hold-id passer sammen.");
    err.statusCode = 422;
    throw err;
  }
  matches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const pool = data.Pool || {};
  const competition = [pool.RowName, pool.PoolName].filter(Boolean).join(" · ") || null;
  return { teamName: null, competition, matches, source: "official-api" };
}

async function fetchScrape(url) {
  const pageRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MOTM-app/1.0)" },
  });
  if (!pageRes.ok) {
    const err = new Error(`DBU svarede med status ${pageRes.status}. Prøv igen senere.`);
    err.statusCode = 502;
    throw err;
  }
  const html = await pageRes.text();
  const $ = cheerio.load(html);

  const teamName = $("h1").first().text().trim() || null;
  const competition = $("h3").first().text().trim() || null;

  const matches = [];
  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 6) return;

    const kampnrText = $(cells[1]).text().trim();
    const kampnr = parseInt(kampnrText, 10);
    if (!kampnr || Number.isNaN(kampnr)) return;

    const datoText = $(cells[2]).text().trim();
    const dateMatch = datoText.match(/(\d{2})-(\d{2})\s*(\d{4})/);
    if (!dateMatch) return;
    const [, dd, mm, yyyy] = dateMatch;
    const date = `${yyyy}-${mm}-${dd}`;

    const time = $(cells[3]).text().trim().match(/\d{1,2}:\d{2}/)?.[0] || "";
    const home = $(cells[4]).text().trim().replace(/\s+/g, " ");
    const away = $(cells[5]).text().trim().replace(/\s+/g, " ");
    const venue = cells.length > 6 ? $(cells[6]).text().trim() : "";

    if (!home || !away) return;

    matches.push({ id: kampnr, date, time, home, away, venue });
  });

  if (!matches.length) {
    const err = new Error("Kunne ikke finde nogen kampe på siden. DBU kan have ændret sidestrukturen, eller linket peger ikke på et kampprogram.");
    err.statusCode = 422;
    throw err;
  }

  matches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { teamName, competition, matches, source: "scrape" };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAdmin(req)) return sendUnauthorized(res);

  try {
    if (req.method === "POST" && req.body?.apiKey && req.body?.poolId && req.body?.teamId) {
      const data = await fetchOfficial(String(req.body.apiKey), String(req.body.poolId), String(req.body.teamId));
      return res.status(200).json(data);
    }

    // Afvis API-nøgle i query-string (må ikke logges i URL'er)
    if (req.query?.apiKey) {
      return res.status(400).json({ error: "Send API-nøgle via POST-body, ikke i URL'en." });
    }

    const url = req.method === "POST" ? req.body?.url : req.query?.url;
    if (!url || typeof url !== "string" || !/dbu\.dk\/.*kampprogram/i.test(url)) {
      return res.status(400).json({ error: "Angiv enten apiKey+poolId+teamId i POST-body, eller et gyldigt DBU-kampprogram-link." });
    }

    const data = await fetchScrape(url);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message || "Ukendt fejl ved hentning af kampprogram." });
  }
}
