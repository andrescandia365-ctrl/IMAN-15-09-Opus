-- 19-day floor trial, one per account. Cancelled licenses keep data, can't sell.
create table if not exists iman_trials (
  user_id     text primary key,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table iman_licenses add column if not exists cancelled_at timestamptz;
