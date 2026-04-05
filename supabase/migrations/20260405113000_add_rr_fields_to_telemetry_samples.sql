alter table if exists public.telemetry_samples
  add column if not exists rr_intervals_ms double precision[] null,
  add column if not exists rmssd double precision null,
  add column if not exists sdnn double precision null;
