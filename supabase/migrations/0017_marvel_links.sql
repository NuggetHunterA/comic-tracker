-- Marvel Comics app pages (marvelcomicsapp.com/issues/<id>), found once and then reused by "In Webtoon öffnen".
alter table comics.issues add column if not exists webtoon_url text;
