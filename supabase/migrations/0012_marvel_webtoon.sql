-- Marvel moves up to a second stage: its issues are read in the Marvel app on Webtoon
-- (Ultimate tier, readable some days after print, like DC Universe Infinite).
alter table comics.user_issues drop constraint user_issues_format_check;
alter table comics.user_issues add constraint user_issues_format_check check (format in ('print','infinite','webtoon'));

alter table comics.followed_series drop constraint followed_series_default_format_check;
alter table comics.followed_series add constraint followed_series_default_format_check check (default_format in ('print','infinite','webtoon'));

alter table comics.settings add column if not exists webtoon_delay_days int not null default 30;
