create table if not exists app_config (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;

-- Only service role can read/write
create policy "service role full access"
  on app_config
  for all
  to service_role
  using (true)
  with check (true);
