-- One dueño, N locales. Each store is its own kiosk snapshot.
create table if not exists kiosk_store (
  user_id    text not null,
  store_id   text not null,
  name       text not null default 'Local',
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, store_id)
);
create index if not exists kiosk_store_user_idx on kiosk_store (user_id, updated_at desc);

create table if not exists kiosk_account (
  user_id         text primary key,
  active_store_id text not null,
  updated_at      timestamptz not null default now()
);
