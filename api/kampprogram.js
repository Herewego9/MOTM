// Vercel serverless-funktion: /api/kampprogram
// Henter og aflæser et DBU "kampprogram"-link server-side (undgår CORS-spærren
// som ellers forhindrer browseren i at hente andre hjemmesiders data direkte).
//
// Kald: /api/kampprogram?url=https://dbu.dk/resultater/hold/XXXXXX_XXXXXX/kampprogram

import * as cheerio from "cheerio";

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string" || !/dbu\.dk\/.*kampprogram/i.test(url)) {
    return res.status(400).json({ error: "Angiv et gyldigt DBU-kampprogram-link (skal indeholde dbu.dk og 'kampprogram')." });
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

    res.status(200).json({ teamName, competition, matches });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ukendt fejl ved hentning af kampprogram." });
  }
}
