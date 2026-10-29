-- DC Connect, DC's monthly catalog. Metron does not list it; the infinite Edge Function finds
-- new issues on Infinite and their on-sale dates on dc.com.
create table if not exists comics.connect_issues (
  number int primary key,
  infinite_url text,           -- null while only dc.com knows it (the next one)
  cover_url text,
  store_date date,             -- on-sale date from dc.com
  seen_on date,                -- first found on Infinite: the day it shows as new
  updated_at timestamptz not null default now()
);
alter table comics.connect_issues enable row level security;
create policy "catalog readable" on comics.connect_issues for select to authenticated using (true);
grant select on comics.connect_issues to authenticated;
grant all on comics.connect_issues to service_role;

create table if not exists comics.connect_reads (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  number int not null,
  read_on date not null,
  primary key (user_id, number)
);
alter table comics.connect_reads enable row level security;
create policy "own rows" on comics.connect_reads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.connect_reads to authenticated;
grant all on comics.connect_reads to service_role;

-- Look for a new catalog every three hours (it lands on a Wednesday, US time).
select cron.schedule('comics-dc-connect', '23 */3 * * *', $$
  select net.http_post(
    url := 'https://towpmroicvnsbobktsfz.supabase.co/functions/v1/infinite',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from comics.sync_state where key='cron_secret')),
    body := '{"action":"connect"}'::jsonb,
    timeout_milliseconds := 60000);
$$);
