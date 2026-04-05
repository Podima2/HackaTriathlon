create table if not exists public.telemetry_sessions (
  session_id text primary key,
  athlete_id text null,
  event_id text null,
  notes text null,
  created_at timestamptz not null default now(),
  event_timezone text null,
  event_utc_offset_seconds integer null,
  client_started_at timestamptz null,
  status text not null check (status in ('active', 'finalized', 'abandoned')),
  finalized_at timestamptz null,
  abandoned_at timestamptz null
);

create table if not exists public.telemetry_samples (
  session_id text not null references public.telemetry_sessions(session_id) on delete cascade,
  sample_seq integer not null,
  bpm integer not null,
  device_observed_at timestamptz null,
  phone_observed_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  elapsed_ms_since_session_start integer not null,
  primary key (session_id, sample_seq)
);

create index if not exists telemetry_samples_session_elapsed_idx
  on public.telemetry_samples (session_id, elapsed_ms_since_session_start);

create index if not exists telemetry_samples_session_phone_idx
  on public.telemetry_samples (session_id, phone_observed_at);
