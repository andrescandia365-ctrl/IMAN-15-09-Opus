-- Append-only tape per local. Devices push events; they do not overwrite the blob.
create table if not exists kiosk_event (
  user_id   text not null,
  store_id  text not null,
  event_id  text not null,
  at        timestamptz not null,
  device_id text not null,
  type      text not null,
  body      jsonb not null,
  primary key (user_id, store_id, event_id)
);
create index if not exists kiosk_event_store_at_idx
  on kiosk_event (user_id, store_id, at);
