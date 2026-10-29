-- Initial comics schema (applied to sport-recap).
create schema if not exists comics;

-- Catalog data from Metron (written only by the sync function with the service role)
create table comics.series (
  id bigint primary key,               -- Metron series id
  name text not null,
  year_began int,
  publisher text not null,             -- 'DC', 'Marvel', 'Image', ...
  volume int,
  status text,                         -- e.g. ongoing / completed
  updated_at timestamptz not null default now()
);

create table comics.issues (
  id bigint primary key,               -- Metron issue id
  series_id bigint not null references comics.series(id) on delete cascade,
  number text not null,
  sort_number numeric,
  store_date date,
  cover_url text,
  is_annual boolean not null default false,
  updated_at timestamptz not null default now()
);
create index issues_series_idx on comics.issues(series_id, sort_number);
create index issues_store_date_idx on comics.issues(store_date);

create table comics.arcs (
  id bigint primary key,               -- Metron arc id
  name text not null,
  updated_at timestamptz not null default now()
);

create table comics.arc_issues (
  arc_id bigint not null references comics.arcs(id) on delete cascade,
  issue_id bigint not null references comics.issues(id) on delete cascade,
  position int,
  primary key (arc_id, issue_id)
);
create index arc_issues_issue_idx on comics.arc_issues(issue_id);

create table comics.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  message text
);

-- Personal data (one row set per signed-in user)
create table comics.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  infinite_delay_days int not null default 30,
  max_per_evening int not null default 3 check (max_per_evening between 1 and 10)
);

create table comics.followed_series (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id bigint not null references comics.series(id) on delete cascade,
  default_format text not null default 'infinite' check (default_format in ('print','infinite','digital')),
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create table comics.wishlist_series (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id bigint not null references comics.series(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create table comics.user_issues (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  issue_id bigint not null references comics.issues(id) on delete cascade,
  status text not null check (status in ('wishlist','expected','pile','read')),
  format text check (format in ('print','infinite','digital')),
  old_pile boolean not null default false,
  bought_on date,
  read_on date,
  rating smallint check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, issue_id)
);
create index user_issues_status_idx on comics.user_issues(user_id, status);

create table comics.plan_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  issue_id bigint not null references comics.issues(id) on delete cascade,
  evening date not null,
  slot smallint not null check (slot between 1 and 10),
  pinned boolean not null default false,
  primary key (user_id, issue_id),
  unique (user_id, evening, slot)
);

-- Row level security
alter table comics.series enable row level security;
alter table comics.issues enable row level security;
alter table comics.arcs enable row level security;
alter table comics.arc_issues enable row level security;
alter table comics.sync_runs enable row level security;
alter table comics.settings enable row level security;
alter table comics.followed_series enable row level security;
alter table comics.wishlist_series enable row level security;
alter table comics.user_issues enable row level security;
alter table comics.plan_entries enable row level security;

create policy "catalog readable" on comics.series for select to authenticated using (true);
create policy "catalog readable" on comics.issues for select to authenticated using (true);
create policy "catalog readable" on comics.arcs for select to authenticated using (true);
create policy "catalog readable" on comics.arc_issues for select to authenticated using (true);
create policy "sync status readable" on comics.sync_runs for select to authenticated using (true);

create policy "own rows" on comics.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on comics.followed_series for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on comics.wishlist_series for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on comics.user_issues for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on comics.plan_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Grants so the Data API can reach the schema once it is exposed
grant usage on schema comics to anon, authenticated, service_role;
grant all on all tables in schema comics to authenticated, service_role;
grant all on all routines in schema comics to authenticated, service_role;
grant all on all sequences in schema comics to authenticated, service_role;
alter default privileges for role postgres in schema comics grant all on tables to authenticated, service_role;
alter default privileges for role postgres in schema comics grant all on routines to authenticated, service_role;
alter default privileges for role postgres in schema comics grant all on sequences to authenticated, service_role;

