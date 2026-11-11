-- Archivkiste: older issues from the subscriptions, suggested when the week is thin,
-- the evening is empty, or it is Halloween or Christmas.

-- An issue taken from the archive. It only fills evenings the plan leaves empty.
alter table comics.user_issues add column if not exists archive boolean not null default false;

-- What the Metron sync found in the archive. One row is one envelope: a run of
-- issues (first issue first) with the hint printed on its label.
-- kind: writer (a writer the reader rated 9+ twice), classic (the built-in list),
--       anniversary (out this week 10, 20 or 30 years ago), season (hw: Halloween, xm: Christmas).
-- status: open (in the box), taken (on the pile; taken_count issues of the run),
--         back (put back, may come again after a while), never (not in the subscription),
--         unavailable (not found on Infinite, never shown).
create table if not exists comics.archive_suggestions (
  id bigserial primary key,
  user_id uuid not null default comics.owner_id() references auth.users on delete cascade,
  kind text not null check (kind in ('writer', 'classic', 'anniversary', 'season')),
  season text check (season in ('hw', 'xm')),
  series_id bigint not null references comics.series on delete cascade,
  issue_ids bigint[] not null check (cardinality(issue_ids) > 0),
  title text,
  label_year int,
  label_writer text,
  reason text,
  verified boolean not null default false,
  status text not null default 'open' check (status in ('open', 'taken', 'back', 'never', 'unavailable')),
  taken_count int not null default 0,
  -- anniversary: the Monday of the week it belongs to; season: the first day of that season.
  valid_from date,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (user_id, kind, issue_ids)
);
create index if not exists archive_suggestions_status on comics.archive_suggestions (user_id, status);

alter table comics.archive_suggestions enable row level security;
create policy "owner rows" on comics.archive_suggestions for all to anon, authenticated
  using (user_id = (select comics.owner_id())) with check (user_id = (select comics.owner_id()));
grant select, insert, update, delete on comics.archive_suggestions to anon, authenticated;
grant all on comics.archive_suggestions to service_role;
grant usage, select on sequence comics.archive_suggestions_id_seq to anon, authenticated, service_role;
