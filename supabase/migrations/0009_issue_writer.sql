-- One writer per issue for the detail, from Metron's issue credits (fetched on demand and by the cron for the pile).
alter table comics.issues
  add column if not exists writer text,
  add column if not exists writer_synced_at timestamptz;
