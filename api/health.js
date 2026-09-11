import { healthCheck } from "./_lib/relationalStore.js";
import { getDataBackend, getClubSlug } from "./_lib/dataBackend.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await healthCheck();
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (e) {
    console.error("health error:", e);
    return res.status(503).json({
      ok: false,
      backend: getDataBackend(),
      clubSlug: getClubSlug(),
      error: e.message || "Health check failed",
      time: new Date().toISOString(),
    });
  }
}
