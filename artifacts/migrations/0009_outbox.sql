-- Password-reset (and later mail) outbox. Support copies the link if SMTP is off.
create table if not exists iman_outbox (
  id text primary key,
  kind text not null,
  recipient text not null,
  subject text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists iman_outbox_created_idx on iman_outbox (created_at desc);
