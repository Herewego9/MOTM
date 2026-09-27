/** Oversætter rå fetch/Supabase-fejl til handlingsorienterede danske beskeder. */
export function toClientError(err, fallback = "Der opstod en fejl.") {
  const raw = err?.message || (typeof err === "string" ? err : "") || "";
  const causeCode = err?.cause?.code || "";
  const causeHost = err?.cause?.hostname || "";
  const text = `${raw} ${causeCode} ${causeHost} ${err?.cause?.message || ""}`.toLowerCase();

  if (
    /fetch failed|failed to fetch|enotfound|econnrefused|econnreset|etimedout|network/.test(text)
    || causeCode === "ENOTFOUND"
  ) {
    const hostHint = causeHost ? ` (${causeHost})` : "";
    return (
      "Kan ikke nå databasen" + hostHint + ". " +
      "Tjek at VITE_SUPABASE_URL / SUPABASE_URL peger på et eksisterende Supabase-projekt, " +
      "og at projektet ikke er slettet eller pauset. Statistikken er ikke nødvendigvis slettet — " +
      "appen kan bare ikke hente den lige nu."
    );
  }

  if (/permission denied|row-level security|jwt/i.test(raw)) {
    return raw + " Tjek SUPABASE_SERVICE_ROLE_KEY og RLS/GRANT på kv_store.";
  }

  return raw || fallback;
}
