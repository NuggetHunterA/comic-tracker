-- Events: cross-series reading orders the reader keeps by hand. They replace
-- Metron story arcs, which were too sparse to plan with.
create table if not exists comics.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  short text not null,                 -- Kürzel on the cover markers, e.g. "K.O."
  color text not null,                 -- one of the app's event colours (src/lib/events.ts)
  manual_order boolean not null default false, -- false: ordered by store date
  created_at timestamptz not null default now()
);
alter table comics.events enable row level security;
create policy "own rows" on comics.events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.events to authenticated;
grant all on comics.events to service_role;

-- An issue belongs to at most one event per reader.
create table if not exists comics.event_issues (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  event_id bigint not null references comics.events on delete cascade,
  issue_id bigint not null references comics.issues on delete cascade,
  position int not null default 0,
  primary key (user_id, issue_id)
);
create index if not exists event_issues_event_idx on comics.event_issues(event_id);
alter table comics.event_issues enable row level security;
create policy "own rows" on comics.event_issues for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.event_issues to authenticated;
grant all on comics.event_issues to service_role;

-- Carry the Metron arcs a reader has issues of over as their own events.
with mine as (
  select distinct u.user_id, a.id as arc_id, a.name
  from comics.user_issues u
  join comics.arc_issues ai on ai.issue_id = u.issue_id
  join comics.arcs a on a.id = ai.arc_id
), made as (
  insert into comics.events (user_id, name, short, color, manual_order)
  select user_id, name, case when length(name) <= 10 then name else regexp_replace(name, '^.*\s', '') end, 'gelb', true from mine
  returning id, user_id, name
)
insert into comics.event_issues (user_id, event_id, issue_id, position)
select m.user_id, m.id, ai.issue_id, coalesce(ai.position, 0)
from made m
join mine on mine.user_id = m.user_id and mine.name = m.name
join comics.arc_issues ai on ai.arc_id = mine.arc_id
on conflict do nothing;
