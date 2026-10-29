# Comic-Stapel

Persönlicher Lese-Tracker für Comics: Plan für jeden Abend, Stapel ungelesener Hefte, Katalog der Neuerscheinungen (DC, Marvel, Image) und gefolgte Serien. Daten von [Metron](https://metron.cloud).

- App: https://comic-tracker-nine.vercel.app (Vite + React + TypeScript, installierbare PWA). GitHub Pages baut parallel unter `/comic-tracker/`, zum Installieren aber Vercel nutzen.
- Daten: Supabase (Schema `comics`), Anmeldung per Magic Link
- Abgleich: Edge Function `supabase/functions/metron`, stündlich per pg_cron

```sh
npm install
npm run dev     # lokal
npm test        # Plan-Logik
npm run build
```

Die Datenbank-Migrationen liegen in `supabase/migrations`.
