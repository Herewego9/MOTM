/** Feature-flag for data-backend. Default = blob (nuværende produktion). */
export function getDataBackend() {
  const raw = String(process.env.DATA_BACKEND || "blob").trim().toLowerCase();
  return raw === "relational" ? "relational" : "blob";
}

export function isRelationalBackend() {
  return getDataBackend() === "relational";
}

/** Hvilken klub denne deployment betjener i fase 1 (single-tenant edge). */
export function getClubSlug() {
  return String(process.env.MOTM_CLUB_SLUG || "st70").trim().toLowerCase() || "st70";
}
