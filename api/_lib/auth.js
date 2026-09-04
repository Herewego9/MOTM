import crypto from "crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 timer

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !password) return false;
  return timingSafeEqualStr(password, expected);
}

export function createAdminToken() {
  const secret = getSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD er ikke konfigureret på serveren.");
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac("sha256", secret).update(`motm-admin:${exp}`).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const secret = getSecret();
  if (!secret) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || Number.isNaN(exp) || Date.now() > exp) return false;
  const expected = crypto.createHmac("sha256", secret).update(`motm-admin:${exp}`).digest("hex");
  return timingSafeEqualStr(sig, expected);
}

export function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-admin-token"];
  return typeof alt === "string" ? alt.trim() : "";
}

export function requireAdmin(req) {
  return verifyAdminToken(getBearerToken(req));
}

export function sendUnauthorized(res) {
  return res.status(401).json({ error: "Ikke autoriseret. Log ind som admin igen." });
}
