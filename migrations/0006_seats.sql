-- Plan seats (how many locales the code opens) + local alias + dueño phone
alter table iman_licenses add column if not exists seats integer not null default 1;
alter table kiosk_store add column if not exists alias text not null default '';
alter table kiosk_account add column if not exists phone text not null default '';
alter table kiosk_account add column if not exists owner_name text not null default '';
