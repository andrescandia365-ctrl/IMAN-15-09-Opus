-- WooCommerce fulfillment + guess protection for license codes.
alter table iman_vendor add column if not exists shop_secret text not null default '';

alter table iman_licenses add column if not exists woo_order_id text;
alter table iman_licenses add column if not exists issued_to_email text not null default '';

create unique index if not exists iman_licenses_woo_order_uidx
  on iman_licenses (woo_order_id)
  where woo_order_id is not null and woo_order_id <> '';

create table if not exists iman_license_attempts (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists iman_license_attempts_ip_at on iman_license_attempts (ip, at);
