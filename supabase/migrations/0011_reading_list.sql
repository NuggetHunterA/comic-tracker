-- The reading plan as a saved list, read top to bottom. The app sorts it by
-- the plan rules only when the reader asks or changes the rules; reading an
-- issue never reorders it. manual: moved there by hand, kept through sorts.
-- added: slotted in since the last sort.
create table if not exists comics.reading_list (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  issue_id bigint not null references comics.issues on delete cascade,
  position int not null,
  manual boolean not null default false,
  added boolean not null default false,
  primary key (user_id, issue_id)
);
alter table comics.reading_list enable row level security;
create policy "own rows" on comics.reading_list for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.reading_list to authenticated;
grant all on comics.reading_list to service_role;

-- The rules the list was last sorted by (series ranking and events). When
-- they change, the app sorts the list again.
alter table comics.settings add column if not exists list_rules text;
