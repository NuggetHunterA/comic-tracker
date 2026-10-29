-- Digital purchases are no longer a format: issues are read in Infinite or bought in print.
update comics.user_issues set format = 'print' where format = 'digital';
update comics.followed_series set default_format = 'print' where default_format = 'digital';

alter table comics.user_issues drop constraint user_issues_format_check;
alter table comics.user_issues add constraint user_issues_format_check check (format in ('print','infinite'));

alter table comics.followed_series drop constraint followed_series_default_format_check;
alter table comics.followed_series add constraint followed_series_default_format_check check (default_format in ('print','infinite'));
