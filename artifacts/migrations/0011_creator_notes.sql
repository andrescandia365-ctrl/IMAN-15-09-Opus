-- Estudio only. Notes of the IMAN creator. Never shown on the kiosk floor.
create table if not exists creator_note (
  id         text primary key,
  user_id    text not null,
  title      text not null,
  body       text not null,
  tag        text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists creator_note_created_idx
  on creator_note (user_id, created_at desc);
