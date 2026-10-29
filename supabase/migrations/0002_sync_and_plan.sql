-- Sync bookkeeping, plan exclusion and relaunch dismissals.
alter table comics.issues
  add column if not exists metron_modified timestamptz,
  add column if not exists detail_synced_at timestamptz;

alter table comics.series
  add column if not exists issues_synced_at timestamptz;

alter table comics.user_issues
  add column if not exists skip_plan boolean not null default false;

alter table comics.user_issues drop constraint if exists user_issues_status_check;
alter table comics.user_issues add constraint user_issues_status_check
  check (status in ('wishlist', 'expected', 'pile', 'read', 'dismissed'));

-- Pins are ordered by slot; several pins may share an evening and slot.
alter table comics.plan_entries drop constraint if exists plan_entries_user_id_evening_slot_key;

create table if not exists comics.dismissed_suggestions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  series_id bigint not null references comics.series on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, series_id)
);
alter table comics.dismissed_suggestions enable row level security;
create policy "own rows" on comics.dismissed_suggestions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on comics.dismissed_suggestions to authenticated;
grant all on comics.dismissed_suggestions to service_role;

create table if not exists comics.sync_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table comics.sync_state enable row level security;
grant all on comics.sync_state to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;
