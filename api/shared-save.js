import { requireAdmin, sendUnauthorized } from "./_lib/auth.js";
import { sanitizeShared, saveShared } from "./_lib/sharedStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireAdmin(req)) return sendUnauthorized(res);

  const shared = req.body?.shared;
  if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
    return res.status(400).json({ error: "Mangler gyldigt shared-objekt." });
  }

  try {
    const cleaned = sanitizeShared(shared);
    const updated_at = await saveShared(cleaned);
    return res.status(200).json({ updated_at, shared: cleaned });
  } catch (e) {
    console.error("shared-save error:", e);
    return res.status(e.statusCode || 500).json({ error: e.message || "Kunne ikke gemme data." });
  }
}
