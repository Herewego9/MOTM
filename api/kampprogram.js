// Vercel serverless-funktion: /api/kampprogram
// To måder at hente kampprogrammet på:
//   1) Officielt DBU API (foretrukket, hvis klubben har en API-nøgle):
//      /api/kampprogram?apiKey=...&poolId=...&teamId=...
//   2) Skrabning af den offentlige kampprogram-side (fallback, kræver intet login):
//      /api/kampprogram?url=https://dbu.dk/resultater/hold/XXXXXX_XXXXXX/kampprogram

import * as cheerio from "cheerio";

// Omregner et DBU-tidsstempel (med tidszone-offset) til dansk dato/tid,
// uanset hvilken tidszone selve serveren kører i.
function toDanishDateTime(isoWithOffset) {
  const dt = new Date(isoWithOffset);
  const parts = new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(dt);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export default async function handler(req, res) {
  const { url, apiKey, poolId, teamId } = req.query;

  // ---- 1) Officielt DBU API ----
  if (apiKey && poolId && teamId) {
    try {
      const apiUrl = `https://clubservice.dbu.dk/api/TeamMatch?APIKey=${encodeURIComponent(apiKey)}&PoolId=${encodeURIComponent(poolId)}&TeamId=${encodeURIComponent(teamId)}`;
      const apiRes = await fetch(apiUrl, { headers: { Accept: "application/json" } });
      if (!apiRes.ok) {
        return res.status(502).json({ error: `DBU's officielle API svarede med status ${apiRes.status}. Tjek at API-nøgle, Pulje-id og Hold-id er korrekte.` });
      }
      const data = await apiRes.json();
      const matches = (data.MatchList || []).map(m => {
        const { date, time } = toDanishDateTime(m.MatchDateTime);
        return { id: m.Id, date, time, home: m.HomeTeamName, away: m.AwayTeamName, venue: m.StadiumName || "" };
      });
      if (!matches.length) {
        return res.status(422).json({ error: "DBU's API returnerede ingen kampe. Tjek at Pulje-id og Hold-id passer sammen." });
      }
      matches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const pool = data.Pool || {};
      const competition = [pool.RowName, pool.PoolName].filter(Boolean).join(" · ") || null;
      return res.status(200).json({ teamName: null, competition, matches, source: "official-api" });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Ukendt fejl ved kald til DBU's officielle API." });
    }
  }

  // ---- 2) Fallback: skrabning af den offentlige kampprogram-side ----
  if (!url || typeof url !== "string" || !/dbu\.dk\/.*kampprogram/i.test(url)) {
    return res.status(400).json({ error: "Angiv enten et gyldigt DBU-kampprogram-link, eller API-nøgle + Pulje-id + Hold-id." });
  }

  try {
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MOTM-app/1.0)" },
    });
    if (!pageRes.ok) {
      return res.status(502).json({ error: `DBU svarede med status ${pageRes.status}. Prøv igen senere.` });
    }
    const html = await pageRes.text();
    const $ = cheerio.load(html);

    const teamName = $("h1").first().text().trim() || null;
    const competition = $("h3").first().text().trim() || null;

    const matches = [];
    $("table tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 6) return; // spring header-/tomme rækker over

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
      return res.status(422).json({ error: "Kunne ikke finde nogen kampe på siden. DBU kan have ændret sidestrukturen, eller linket peger ikke på et kampprogram." });
    }

    matches.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    res.status(200).json({ teamName, competition, matches, source: "scrape" });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ukendt fejl ved hentning af kampprogram." });
  }
}
