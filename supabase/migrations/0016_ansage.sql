-- Ansage: how often Claude was asked per day, so the public function cannot run
-- up costs (the app has no sign-in; the edge function caps the calls per day).
create table if not exists comics.ansage_calls (
  day date primary key,
  calls int not null default 0
);
alter table comics.ansage_calls enable row level security;
grant all on comics.ansage_calls to service_role;

-- Counts one call for today (Berlin time) and returns the count including it.
create or replace function comics.ansage_count() returns int
language sql security definer set search_path = comics as $$
  insert into comics.ansage_calls as a (day, calls) values ((now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (day) do update set calls = a.calls + 1
  returning calls;
$$;
revoke all on function comics.ansage_count() from public, anon, authenticated;
grant execute on function comics.ansage_count() to service_role;
