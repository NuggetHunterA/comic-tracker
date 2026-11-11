# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated and approved: Vite + React + TypeScript as an installable PWA on GitHub Pages (`/comic-tracker/`). Data in the Supabase project sport-recap, own schema `comics`. Adrian is the only user: he signs in with email and password once per device and the session stays on the device (no shared app account, no credentials in the bundle). The `metron` Edge Function syncs Metron hourly via pg_cron (followed series and the catalog for last month to two months ahead) and serves series search for the app.

## Users

One person: Adrian, a returning comic reader in Germany who used to buy and read 15 to 20 comics a month and stopped for lack of time. Reads mostly DC (about 80 %) and current Marvel (about 20 %), as his interests go; no fixed quota. Uses the app alone, mainly on a Samsung Galaxy Z Fold 8 (narrow cover screen and unfolded near-square inner screen), in the evening when deciding what to read.

## Product Purpose

A personal comic reading tracker: see what releases each month, keep the pile of unread issues, follow series and a wishlist, and get a daily reading plan. Success: Adrian always knows what to read tonight, what is coming, and when an issue becomes readable in his subscriptions (DC Universe Infinite, Marvel on Webtoon).

## Positioning

Unlike pull-list apps (League of Comic Geeks etc.), it plans the reading itself: it knows each issue's format and computes when a DC issue unlocks on DC Universe Infinite Ultra and a Marvel issue in the Marvel app on Webtoon (Ultimate tier; both print date + 30 days), then fills each evening with at most 3 readable issues of one publisher.

## Operating Context

- Data from the Metron comic database API: series, issue number, store date, main cover image URL.
- DC Universe Infinite Ultra subscription (print + 30 days) and, from its launch on 16 Nov 2026, the Marvel Comics app powered by WEBTOON, Ultimate tier (print + about 30 days; delay kept in settings as webtoon_delay_days). Anything else is bought in print. Image is no longer tracked in the catalog.
- Print issues do not arrive in German shops on release day; Adrian marks print purchases as bought by hand.
- Reads every evening; unread issues roll over to the next evening.

## Capabilities and Constraints

- Areas: Plan (tonight plus the next evenings), Stapel (pile, with the whole reading order evening by evening and the Bilanz), Katalog (monthly releases, tabs DC and Marvel, cover grid), Meine Serien (followed series, wishlist, events; filter chips Alle · DC · Marvel).
- Series: search any Metron series from Meine Serien; every series has "Alle Hefte", the full run of that volume newest first, each issue marked read, on the pile or missing. Older issues can be marked as read earlier (no reading date), one by one or up to a number, and a series can be put on the pile from a number on (as regular pile issues, after the old pile); read and pile issues stay untouched.
- Issue states: Wunschliste, Stapel, Gelesen. "Erwartet" is not stored: a pile issue counts as expected until its format makes it readable (print once bought, Infinite and Webtoon after the delay). Formats: Print, Infinite (Ultra, DC) and Webtoon (Ultimate, Marvel). Adrian reads in the subscription or buys print, never digital single issues.
- Reading list: the plan is a saved list (`reading_list`) read top to bottom, max_per_evening issues an evening (default 3), laid out as far ahead as there are dated issues. Reading an issue never reshuffles it; the app sorts it by the plan rules only when Adrian asks or the rules (series ranking, events) change, and new issues are slotted in. Issues moved by hand keep their place through sorts and carry a hand mark until released back to the rules.
- Plan rules: only readable issues; series in number order; old pile first, then new issues; read an event in one go (events are cross-series reading orders Adrian keeps in Meine Serien, each with a colour; Metron story arcs are not used), switch series only after an event; a started event comes first every evening as far as its issues are readable; without an event, read blocks of several issues per series; max 3 per evening; one publisher per evening (the first readable issue sets it; the other publisher only fills up when nothing of this one is readable; manual moves are exempt).
- Rating on read: 1 to 10, whole steps.
- Annuals and specials of followed series go to the wishlist only. Relaunches are suggested, never auto-followed.
- Only the main cover is shown.
- Old pile (all print): Detective Comics #1085 to #1098, Batman (2016) #153 to #160, Nightwing (2016) #113 to #127 (37 issues).
- Every cover outside the catalog and a series' own run carries a publisher mark: DC's blue roundel or Marvel's red box as a sticker over the top right corner, a dot of the colour on small covers.
- Later, not now: push notifications when an issue unlocks; Marvel Previews like DC Connect once it is clear whether the Webtoon app carries it.
- UI language: German.

## Brand Commitments

Visual direction chosen by Adrian: B "Torn Flyer / Kopierer-Wand" (photocopy grey, toner black, neon pink spot colour, taped-up covers; expected Infinite issues stay a photocopy until readable). Navigation: "Fehldruck" bar (black, large Anton labels with counters, active item on an offset pink print block; side rail when unfolded).

## Evidence on Hand

Concept doc: https://claude.ai/artifact/Q11f1UedSLBtS5h6Q3PfyR. Cover images come from Metron at runtime; no other assets exist.

## Product Principles

- Tonight first: the answer to "what do I read now" is always one tap away.
- The plan suggests, Adrian decides: every automatic choice can be overridden and stays overridden.
- DC is the main stage, Marvel the second one; Image is gone.
- Covers carry the recognition; text stays short.
