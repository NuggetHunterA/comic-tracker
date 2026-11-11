-- Single-user app without sign-in: the browser talks to the database with the publishable key alone (role anon).
-- Every per-user row belongs to one owner, kept in comics.sync_state (readable by the service role only).
-- Anyone with the app's URL can read and change these rows; that is the accepted trade-off for no login.

-- The owner is the account that holds the data so far.
insert into comics.sync_state (key, value)
select 'owner_id', user_id::text from comics.user_issues group by user_id order by count(*) desc limit 1
on conflict (key) do nothing;

create or replace function comics.owner_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select value::uuid from comics.sync_state where key = 'owner_id' $$;
revoke all on function comics.owner_id() from public;
grant execute on function comics.owner_id() to anon, authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['settings','followed_series','wishlist_series','user_issues','plan_entries',
    'dismissed_suggestions','connect_reads','events','event_issues','series_order','reading_list'] loop
    execute format('alter table comics.%I alter column user_id set default comics.owner_id()', t);
    execute format('drop policy if exists "own rows" on comics.%I', t);
    execute format('create policy "owner rows" on comics.%I for all to anon, authenticated
      using (user_id = (select comics.owner_id())) with check (user_id = (select comics.owner_id()))', t);
    execute format('grant select, insert, update, delete on comics.%I to anon', t);
  end loop;
  foreach t in array array['series','issues','connect_issues'] loop
    execute format('drop policy if exists "catalog readable" on comics.%I', t);
    execute format('create policy "catalog readable" on comics.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on comics.%I to anon', t);
  end loop;
end $$;

drop policy if exists "sync status readable" on comics.sync_runs;
create policy "sync status readable" on comics.sync_runs for select to anon, authenticated using (true);
grant select on comics.sync_runs to anon;

grant execute on function comics.materialize_followed() to anon;
grant usage, select on all sequences in schema comics to anon;
