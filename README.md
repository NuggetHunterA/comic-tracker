# Comic-Stapel

Persönlicher Lese-Tracker für Comics: Plan für jeden Abend, Stapel ungelesener Hefte, Katalog der Neuerscheinungen (DC und Marvel) und gefolgte Serien. Daten von [Metron](https://metron.cloud).

- App: Vite + React + TypeScript, installierbar (PWA), gehostet auf GitHub Pages
- Daten: Supabase (Schema `comics`), keine Anmeldung. Die App nutzt nur den öffentlichen Schlüssel, RLS gibt ihr die Zeilen des einen Besitzers frei (`comics.owner_id()`, Migration 0013). Wer die URL kennt, kann die Daten lesen und ändern.
- Abgleich: Edge Function `supabase/functions/metron`, stündlich per pg_cron
- „In Infinite öffnen“: Edge Function `supabase/functions/infinite` sucht die Heftseite auf DC Universe Infinite und merkt sie sich; ohne Treffer öffnet der Button die Infinite-Suche
- DC Connect: dieselbe Funktion schaut alle drei Stunden per pg_cron auf Infinite nach dem neuesten Monatskatalog (Link, Cover) und holt den Termin des nächsten von dc.com

```sh
npm install
npm run dev     # lokal
npm test        # Plan-Logik und Routen
npm run e2e     # Smoke-Test im Browser (Playwright, Supabase aus Fixtures)
npm run build
```

Die Datenbank-Migrationen liegen in `supabase/migrations`.

Jede Ansicht hat eine eigene Adresse im Hash, z. B. `#plan/heft/12`, `#stapel/serie/4/alle` oder `#serien/events/7` (alle Formen in `src/lib/route.ts`). Die Zurück-Taste schließt so ein offenes Heft, und Links führen direkt dorthin.

Der Datenzugriff ist geteilt: `src/lib/load.ts` lädt, `src/lib/listSync.ts` rechnet den Plan und hält die Leseliste in Supabase aktuell, `src/lib/actions.ts` schreibt. `src/lib/store.tsx` setzt das zusammen.
