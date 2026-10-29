-- Arc issue lists from Metron carry series without a publisher. Series first
-- seen that way get one later from the catalog or a series sync.
alter table comics.series alter column publisher drop not null;
