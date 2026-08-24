// Vercel serverless-funktion: /api/kampinfo
// Henter og aflæser en DBU "kampinfo"-side (holdopstillinger + målscorere/assists).
// Kald: /api/kampinfo?url=https://dbu.dk/resultater/kamp/XXXXXX_XXXXXX/kampinfo
//
// Parsing-strategi (valideret mod et rigtigt eksempel, 12-04-2026 ST70 4-3 Christiansbjerg):
// Siden lister begivenheder som en flad rækkefølge af "'<minuttal>" efterfulgt af enten
// et målikon og 1-2 spillernavne, i skiftende rækkefølge (ikon-før-navne ELLER
// navne-før-ikon, alt efter hvilket hold der har scoret – hjemmehold har ikonet FØR
// navnene, udehold har det EFTER). Det første navn i gruppen er altid målscoreren,
// det andet (hvis det findes) er assist-spilleren. Vi tæller alle "'<tal>"-grupper med
// et målikon som ét mål, uanset rækkefølgen.

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

    // ---- Holdnavne, fx "ST 70 - Christiansbjerg IF (2)" ----
    const titleText = $("h1").first().text().trim() || $("title").first().text().trim();
    const parts = titleText.split(" - ").map(s => s.trim()).filter(Boolean);
    const homeTeam = parts[0] || null;
    const awayTeam = parts[1] || null;

    // ---- Holdopstillinger (springer "Officials"-tabeller over – de er ikke spillere) ----
    const squads = {};
    $("table").each((_, table) => {
      const headerText = $(table).find("th").first().text().trim();
      if (!headerText || /^officials?$/i.test(headerText)) return;
      const names = [];
      $(table).find("td").each((_, td) => {
        const t = $(td).text().trim();
        if (t && t.length > 1) names.push(t);
      });
      if (names.length) squads[headerText] = names;
    });

    // ---- Flad token-liste af hele siden, i den rækkefølge indholdet reelt står i HTML'en ----
    const tokens = [];
    function walk(el) {
      $(el).contents().each((_, node) => {
        if (node.type === "text") {
          const t = $(node).text().trim();
          if (t) tokens.push({ type: "text", value: t });
        } else if (node.type === "tag") {
          if (node.name === "img") {
            const src = $(node).attr("src") || "";
            if (src.includes("icon_sr_goal")) tokens.push({ type: "goal_icon" });
          } else {
            walk(node);
          }
        }
      });
    }
    walk("body");

    // ---- Grupér tokens efter minut-markør (fx "'84") ----
    const events = [];
    let current = null;
    tokens.forEach(tok => {
      if (tok.type === "text" && /^'\d{1,3}$/.test(tok.value)) {
        if (current) events.push(current);
        current = { minute: tok.value.replace("'", ""), items: [] };
      } else if (current) {
        current.items.push(tok);
      }
    });
    if (current) events.push(current);

    // ---- Udtræk mål: kun grupper der indeholder et målikon ----
    const goals = [];
    events.forEach(ev => {
      const iconIndex = ev.items.findIndex(i => i.type === "goal_icon");
      if (iconIndex === -1) return; // ikke en målhændelse (fx "Kamp start", "1. halvleg slut")
      const names = ev.items.filter(i => i.type === "text").map(i => i.value);
      const scorer = names[0] || null;
      const assist = names[1] || null;
      let side = "unknown";
      if (names.length > 0) {
        const firstNameIndex = ev.items.findIndex(i => i.type === "text");
        side = iconIndex < firstNameIndex ? "home" : "away";
      }
      goals.push({ minute: ev.minute, scorer, assist, side });
    });
    goals.sort((a, b) => parseInt(a.minute, 10) - parseInt(b.minute, 10));

    // OBS: Vi fejler bevidst IKKE, bare fordi der ingen mål er (0-0-kamp, eller mål/assist
    // endnu ikke registreret af DBU). Truppen (holdopstillingerne) skal stadig kunne hentes.
    if (!Object.keys(squads).length && !goals.length) {
      return res.status(422).json({ error: "Fandt hverken holdopstilling eller mål på siden. Kampen er måske ikke afviklet endnu." });
    }

    res.status(200).json({ homeTeam, awayTeam, squads, goals });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ukendt fejl ved hentning af kampinfo." });
  }
}
