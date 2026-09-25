-- Qué aparato es la caja de cada local (plan del celu, paso b). El servidor lo
-- decide: tomar la caja cambia `caja_device` solo si `caja_ver` es la que el
-- aparato esperaba, igual que el `rev` de la fotocopia. Null = local sin caja
-- anotada: se comporta como antes, cobra la pantalla de PC.
alter table kiosk_store add column if not exists caja_device text;
alter table kiosk_store add column if not exists caja_ver integer not null default 0;
alter table kiosk_store add column if not exists caja_desde timestamptz;
