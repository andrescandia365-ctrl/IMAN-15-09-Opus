-- Phone builds a ticket locally, then pushes the whole ticket to the PC till.
-- The PC listens (SSE); it does not poll for scans.
create table if not exists kiosk_desk_ticket (
  user_id    text not null,
  store_id   text not null,
  ticket_id  text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  taken_at   timestamptz,
  primary key (user_id, store_id, ticket_id)
);

create index if not exists kiosk_desk_ticket_pending_idx
  on kiosk_desk_ticket (user_id, store_id, created_at desc)
  where taken_at is null;
