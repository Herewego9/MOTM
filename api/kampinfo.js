// Vercel serverless-funktion: /api/kampinfo
// Henter og aflæser en DBU "kampinfo"-side (holdopstillinger + målscorere/assists).
// Kald: /api/kampinfo?url=https://dbu.dk/resultater/kamp/XXXXXX_XXXXXX/kampinfo
//
// VIGTIGT: Dette er best-effort scraping af en side, vi ikke selv kontrollerer.
// Mål/assist-rækkefølgen er baseret på observeret mønster (scorer = normal tekst,
// assist = lysere/grå tekst, i den rækkefølge de optræder i koden) og bør altid
// tjekkes af en administrator, før det gemmes som statistik.

import * as cheerio from "cheerio";

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== "string" || !/dbu\.dk\/.*kampinfo/i.test(url)) {
    return res.status(400).json({ error: "Angiv et gyldigt DBU kampinfo-link (skal indeholde dbu.dk og 'kampinfo')." });
  }

  try {
    const pageRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MOTM-app/1.0)" } });
    if (!pageRes.ok) {
      return res.status(502).json({ error: `DBU svarede med status ${pageRes.status}. Prøv igen senere.` });
    }
    const html = await pageRes.text();
    const $ = cheerio.load(html);

    // Holdnavne, fx "ST 70 - Christiansbjerg IF (2)"
    const titleText = $("h1").first().text().trim() || $("title").first().text().trim();
    const parts = titleText.split(" - ").map(s => s.trim()).filter(Boolean);
    const homeTeam = parts[0] || null;
    const awayTeam = parts[1] || null;

    // ---- Holdopstillinger: find tabeller med spillernavne ----
    const squads = {};
    $("table").each((_, table) => {
      const headerText = $(table).find("th").first().text().trim();
      if (!headerText) return;
      const names = [];
      $(table).find("td").each((_, td) => {
        const t = $(td).text().trim();
        if (t && t.length > 1 && !/^officials?$/i.test(t)) names.push(t);
      });
      if (names.length) squads[headerText] = names;
    });

    // ---- Mål og assists ----
    // Hver målhændelse markeres af et ikon (icon_sr_goal). Omkring det ligger
    // typisk to navne: øverste/normal tekst = m\u00e5lscorer, nederste/lysere tekst = assist.
    const goals = [];
    $("img[src*='icon_sr_goal']").each((_, icon) => {
      const eventContainer = $(icon).parent().parent(); // event-r\u00e6kken omkring ikonet
      const fullText = eventContainer.text();
      const minuteMatch = fullText.match(/'(\d{1,3})/);
      const minute = minuteMatch ? minuteMatch[1] : null;

      const names = [];
      eventContainer.find("a, span, div").each((_, el) => {
        const t = $(el).text().trim();
        const hasChildren = $(el).children().length > 0;
        if (t && t.length > 1 && !hasChildren && !/^'?\d+$/.test(t)) {
          names.push(t);
        }
      });
      const uniqueNames = [...new Set(names)];
      const scorer = uniqueNames[0] || null;
      const assist = uniqueNames[1] || null;
      if (scorer) goals.push({ minute, scorer, assist });
    });

    res.status(200).json({ homeTeam, awayTeam, squads, goals });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ukendt fejl ved hentning af kampinfo." });
  }
}
