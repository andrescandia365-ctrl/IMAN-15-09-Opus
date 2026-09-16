-- CRM: Estudio can grant extra locales (ceiling 5). Neon stores rows; Estudio is the workshop.
alter table kiosk_account add column if not exists extra_seats integer not null default 0;
