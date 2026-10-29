-- Metron story arcs are gone from the app and the sync (events replace them, 0007).
-- Apply once the app without arcs is live.
drop table if exists comics.arc_issues;
drop table if exists comics.arcs;
alter table comics.issues drop column if exists detail_synced_at;
