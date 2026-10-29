# Comic-Stapel

Persönlicher Lese-Tracker für Comics: Plan für jeden Abend, Stapel ungelesener Hefte, Katalog der Neuerscheinungen (DC, Marvel, Image) und gefolgte Serien. Daten von [Metron](https://metron.cloud).

- App: Vite + React + TypeScript, installierbar (PWA), gehostet auf GitHub Pages
- Daten: Supabase (Schema `comics`), Anmeldung automatisch über ein eigenes App-Konto (`VITE_APP_EMAIL`, `VITE_APP_PASSWORD` in Vercel), sonst E-Mail und Passwort
- Abgleich: Edge Function `supabase/functions/metron`, stündlich per pg_cron

```sh
npm install
npm run dev     # lokal
npm test        # Plan-Logik
npm run build
```

Die Datenbank-Migrationen liegen in `supabase/migrations`.
