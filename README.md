# MOTM – Man of the Match

Hold-app til MVP-afstemning, statistik og rangliste. Frontend: Vite + React. Backend: Vercel serverless (`/api/*`) + Supabase.

## Sikkerhed (vigtigt)

Klientens anon-nøgle må **kun** læse data. Alle writes går via server-API med `SUPABASE_SERVICE_ROLE_KEY`. Admin-adgangskode ligger **ikke** i `VITE_*`.

### Vercel Environment Variables

| Variabel | Scope | Formål |
|----------|--------|--------|
| `VITE_SUPABASE_URL` | Client + Server | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client + Server | Offentlig anon-nøgle (kun SELECT efter RLS) |
| `SUPABASE_URL` | Server (valgfri) | Samme URL hvis I ikke vil genbruge VITE_ |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Skriver til `kv_store` (bypasser RLS) |
| `ADMIN_PASSWORD` | **Server only** | Admin-login (aldrig `VITE_ADMIN_PASSWORD`) |
| `ADMIN_SESSION_SECRET` | **Server only** (valgfri) | HMAC-secret til admin-tokens; fallback = `ADMIN_PASSWORD` |

Fjern den gamle `VITE_ADMIN_PASSWORD` fra Vercel, så den ikke længere bundtes til browseren.

### Supabase RLS

Kør SQL i **staging først**:

`supabase/migrations/20260904120000_kv_store_rls_read_only.sql`

Den gør `kv_store` read-only for `anon`/`authenticated`. Uden denne migration (og med åbne write-policies) er klienten stadig sårbar.

### API-overblik

- `POST /api/admin-login` – password → session-token
- `GET /api/admin-login` – tjek token
- `POST /api/vote` – offentlig stemme (kun hvis kamp er åben)
- `POST /api/shared-save` – admin-gem af delt state
- `POST /api/kampinfo|kampprogram|dbu-teams` – kræver admin-token; DBU API-nøgle i body (ikke query)

DBU API-nøglen gemmes kun i admin-browserens `sessionStorage`, aldrig i delt Supabase-state.

## Deploy-rækkefølge (staging → prod)

1. Sæt server-env vars på Preview/Staging
2. Deploy denne branch til staging
3. Kør RLS-migration mod staging-DB
4. Test: admin-login, stemme, DBU-hent, at direkte klient-upsert fejler
5. Først derefter: samme på production (kræver eksplicit OK)

## Lokal udvikling

```bash
npm install
# .env.local: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
# Server-env til API: brug `vercel dev` med ADMIN_PASSWORD + SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Uden `vercel dev` virker `/api/*` ikke lokalt – brug Vercel Preview til fuld test.
