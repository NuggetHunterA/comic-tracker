-- DC Universe Infinite pages, found or pasted once and then reused by "In Infinite öffnen".
alter table comics.series add column if not exists infinite_url text;
alter table comics.issues add column if not exists infinite_url text;
