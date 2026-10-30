-- The reader's own series ranking for the plan: position in the list, and
-- whether the series sits above the line (read to the end in one go).
-- No rows means the plan orders series by date, as before.
create table if not exists comics.series_order (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  series_id bigint not null references comics.series on delete cascade,
  position int not null,
  whole boolean not null default false,
  primary key (user_id, series_id)
);
alter table comics.series_order enable row level security;
create policy "own rows" on comics.series_order for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.series_order to authenticated;
grant all on comics.series_order to service_role;
