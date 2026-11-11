# Comic-Stapel

Persönlicher Lese-Tracker für Comics: Plan für jeden Abend, Stapel ungelesener Hefte, Katalog der Neuerscheinungen (DC und Marvel) und gefolgte Serien. Daten von [Metron](https://metron.cloud).

- App: Vite + React + TypeScript, installierbar (PWA), gehostet auf GitHub Pages
- Daten: Supabase (Schema `comics`), einmalige Anmeldung pro Gerät mit E-Mail und Passwort, danach bleibt die Sitzung bestehen. Das Passwort steckt nicht im Build.
- Abgleich: Edge Function `supabase/functions/metron`, stündlich per pg_cron
- „In Infinite öffnen“: Edge Function `supabase/functions/infinite` sucht die Heftseite auf DC Universe Infinite und merkt sie sich; ohne Treffer öffnet der Button die Infinite-Suche
- DC Connect: dieselbe Funktion schaut alle drei Stunden per pg_cron auf Infinite nach dem neuesten Monatskatalog (Link, Cover) und holt den Termin des nächsten von dc.com

```sh
npm install
npm run dev     # lokal
npm test        # Plan-Logik
npm run build
```

Die Datenbank-Migrationen liegen in `supabase/migrations`.
