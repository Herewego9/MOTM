# MOTM – Mobil preview (lokal)

Isoleret telefon-prototype til at se app-oplevelsen i browseren.

**Rører ikke** den eksisterende Vite-app i repo-roden (`src/`, `api/`).  
**Ingen** backend, Supabase eller deploy – kun mock-data.

```bash
cd mobile-preview
npm install
npm run dev
```

Åbn http://localhost:5174 — appen vises i en iPhone-ramme på desktop.

### Kampprogram
Brug fanen **Kampe** til at tilføje kampe manuelt (eller “Udfyld eksempel”).
Åbn afstemning dér — fanen **Stem** følger med.
Data gemmes i browserens `localStorage` (ikke Supabase).

