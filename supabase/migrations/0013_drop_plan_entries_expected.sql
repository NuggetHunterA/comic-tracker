-- The plan now lives in comics.reading_list (0011); the old evening/slot table
-- is no longer read or written.
drop table if exists comics.plan_entries;

-- "Erwartet" is derived in the app from format and readability, never stored.
-- Any leftover expected row becomes a regular pile issue.
update comics.user_issues set status = 'pile' where status = 'expected';

alter table comics.user_issues drop constraint if exists user_issues_status_check;
alter table comics.user_issues add constraint user_issues_status_check
  check (status in ('wishlist', 'pile', 'read', 'dismissed'));
