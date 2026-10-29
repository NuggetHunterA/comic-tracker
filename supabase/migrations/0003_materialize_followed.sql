-- Arc issue lists are fetched once per arc.
alter table comics.arcs add column if not exists issues_synced_at timestamptz;

-- Put new issues of followed series on the pile, and annuals or specials of
-- those series on the wishlist. Runs as the caller: a signed-in user only
-- touches their own rows (RLS), the service role covers every user.
create or replace function comics.materialize_followed()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select f.user_id, i.id as issue_id, i.is_annual as annual, f.default_format
    from comics.followed_series f
    join comics.issues i on i.series_id = f.series_id
    where not f.paused and i.store_date >= f.created_at::date - 31
    union all
    select f.user_id, i.id, true, f.default_format
    from comics.followed_series f
    join comics.series s on s.id = f.series_id
    join comics.series a on a.id <> s.id
      and (a.name ilike s.name || ' annual%' or a.name ilike s.name || ' special%')
      and a.year_began >= s.year_began
    join comics.issues i on i.series_id = a.id
    where not f.paused and i.store_date >= f.created_at::date - 31
  ), ins as (
    insert into comics.user_issues (user_id, issue_id, status, format)
    select distinct on (user_id, issue_id) user_id, issue_id,
      case when annual then 'wishlist' else 'pile' end,
      case when annual then null else default_format end
    from candidates
    on conflict (user_id, issue_id) do nothing
    returning 1
  )
  select count(*)::int from ins;
$$;

grant execute on function comics.materialize_followed() to authenticated, service_role;
