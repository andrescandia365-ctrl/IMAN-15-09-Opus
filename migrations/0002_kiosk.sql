-- Per-account kiosk snapshot (1 owner · 1 local)
create table if not exists kiosk_state (
  user_id    text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);
