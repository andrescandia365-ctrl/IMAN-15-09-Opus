-- Orden del servidor para la cinta de movimientos.
-- Antes el cursor era la hora del aparato: un celu que estuvo sin red subía
-- movimientos con hora vieja y la PC, que ya había pasado esa hora, no los
-- bajaba nunca. `seq` lo asigna el servidor al insertar, así que lo que llega
-- tarde igual queda después del cursor de todos.
alter table kiosk_event add column if not exists seq bigserial;
create index if not exists kiosk_event_store_seq_idx
  on kiosk_event (user_id, store_id, seq);
