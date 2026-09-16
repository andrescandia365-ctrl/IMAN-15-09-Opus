-- Concurrency + query shape for more than one till at a time.
alter table kiosk_store add column if not exists rev integer not null default 0;

create index if not exists iman_licenses_expires_idx on iman_licenses (expires_at);
create index if not exists iman_licenses_active_idx
  on iman_licenses (redeemed_by, expires_at)
  where redeemed_by is not null;

-- Attempts table is append-only; keep the lookup cheap.
create index if not exists iman_license_attempts_at_idx on iman_license_attempts (at);
