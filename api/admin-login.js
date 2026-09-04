import { checkAdminPassword, createAdminToken, requireAdmin, sendUnauthorized } from "./_lib/auth.js";

export default async function handler(req, res) {
  // GET = tjek om eksisterende admin-token stadig er gyldigt
  if (req.method === "GET") {
    if (!requireAdmin(req)) return sendUnauthorized(res);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD er ikke konfigureret på serveren." });
  }

  const password = req.body?.password;
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: "Forkert adgangskode." });
  }

  try {
    const token = createAdminToken();
    return res.status(200).json({ token, expiresInHours: 12 });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Kunne ikke oprette session." });
  }
}
