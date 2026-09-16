-- CRM source of truth for real owners. Better Auth stays the login; this table is the workshop.
create table if not exists iman_owners (
  user_id     text primary key,
  email       text not null,
  name        text not null default '',
  extra_seats integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists iman_owners_email_idx on iman_owners (lower(email));
