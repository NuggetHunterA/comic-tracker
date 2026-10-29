# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated and approved: Vite + React + TypeScript as an installable PWA on GitHub Pages (`/comic-tracker/`). Data in the Supabase project sport-recap, own schema `comics`, login by email magic link. The `metron` Edge Function syncs Metron hourly via pg_cron (catalog for last month to two months ahead, issue details and arcs for the pile) and serves series search for the app.

## Users

One person: Adrian, a returning comic reader in Germany who used to buy and read 15 to 20 comics a month and stopped for lack of time. Reads mostly DC (about 95 %), a little Marvel and Image. Uses the app alone, mainly on a Samsung Galaxy Z Fold 8 (narrow cover screen and unfolded near-square inner screen), in the evening when deciding what to read.

## Product Purpose

A personal comic reading tracker: see what releases each month, keep the pile of unread issues, follow series and a wishlist, and get a daily reading plan. Success: Adrian always knows what to read tonight, what is coming, and when a DC issue becomes readable on DC Universe Infinite.

## Positioning

Unlike pull-list apps (League of Comic Geeks etc.), it plans the reading itself: it knows each issue's format and computes when a DC issue unlocks on DC Universe Infinite Ultra (print date + 30 days), then fills each evening with at most 3 readable issues.

## Operating Context

- Data from the Metron comic database API: series, issue number, store date, main cover image URL.
- DC Universe Infinite Ultra subscription (print + 30 days). No Marvel or Image subscription; those are bought.
- Print issues do not arrive in German shops on release day; Adrian marks print and digital purchases as bought by hand.
- Reads every evening; unread issues roll over to the next evening.

## Capabilities and Constraints

- Areas: Plan (today + next 14 evenings), Stapel (pile), Katalog (monthly releases, tabs DC and Marvel + Image, cover grid), Meine Serien (followed series + wishlist).
- Series: search any Metron series from Meine Serien; every series has "Alle Hefte", the full run of that volume newest first, each issue marked read, on the pile or missing. Older issues can be marked as read earlier (no reading date), one by one or up to a number; the pile stays untouched.
- Issue states: Wunschliste, Erwartet, Stapel, Gelesen. Formats: Print, Infinite (Ultra), digital purchase.
- Plan rules: only readable issues; series in number order; old pile first, then new issues; read a story arc in one go (Metron story arcs; crossover arcs in arc order), switch series only after an arc ends; without arc data, read blocks of several issues per series; max 3 per evening; manual moves are pinned.
- Rating on read: 1 to 10, whole steps.
- Annuals and specials of followed series go to the wishlist only. Relaunches are suggested, never auto-followed.
- Only the main cover is shown.
- Old pile (all print): Detective Comics #1085 to #1098, Batman (2016) #153 to #160, Nightwing (2016) #113 to #127 (37 issues).
- Later, not now: push notifications when an issue unlocks on Infinite.
- UI language: German.

## Brand Commitments

Visual direction chosen by Adrian: B "Torn Flyer / Kopierer-Wand" (photocopy grey, toner black, neon pink spot colour, taped-up covers; expected Infinite issues stay a photocopy until readable). Navigation: "Fehldruck" bar (black, large Anton labels with counters, active item on an offset pink print block; side rail when unfolded).

## Evidence on Hand

Concept doc: https://claude.ai/artifact/Q11f1UedSLBtS5h6Q3PfyR. Cover images come from Metron at runtime; no other assets exist.

## Product Principles

- Tonight first: the answer to "what do I read now" is always one tap away.
- The plan suggests, Adrian decides: every automatic choice can be overridden and stays overridden.
- DC is the main stage; Marvel and Image are a side shelf.
- Covers carry the recognition; text stays short.
