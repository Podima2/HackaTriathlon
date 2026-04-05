alter table if exists public.telemetry_samples
  add column if not exists steps integer null;
