## Supabase Telemetry Setup

Use Supabase Postgres for durable telemetry persistence. Once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set on Railway, the backend will automatically stop using local `data/telemetry/*.json` files for sessions and samples.

### 1. Create the tables

Run this SQL in the Supabase SQL editor:

```sql
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
```

### 2. Set Railway environment variables

Set these on the Railway service:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Keep your existing:

```text
TELEMETRY_API_KEY
BASE_RPC_URL
HACKTRI_TOKEN
BASE_PRIVATE_KEY
FAUCET_CLAIM_AMOUNT
FAUCET_COOLDOWN_MS
```

### 3. Redeploy Railway

From the repo root:

```bash
railway up
```

### 4. Verify

Check:

```bash
curl https://hackatriathlon-production.up.railway.app/api/telemetry
curl https://hackatriathlon-production.up.railway.app/api/telemetry/sessions
```

Then start a fresh relay session and confirm it remains present even after Railway restarts.
