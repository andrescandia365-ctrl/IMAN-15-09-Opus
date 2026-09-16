-- Paid IMAN: one vendor, one code = one local, 12 / 24 / 36 months.
create table if not exists iman_vendor (
  id           text primary key default 'vendor',
  user_id      text not null,
  seller_name  text not null default 'IMAN',
  sales_url    text not null default '',
  claimed_at   timestamptz not null default now()
);

create table if not exists iman_licenses (
  code         text primary key,
  months       integer not null,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  redeemed_by  text,
  redeemed_at  timestamptz,
  starts_at    timestamptz,
  expires_at   timestamptz,
  note         text not null default ''
);

create index if not exists iman_licenses_redeemed_by_idx on iman_licenses (redeemed_by);
create index if not exists iman_licenses_created_at_idx on iman_licenses (created_at desc);
