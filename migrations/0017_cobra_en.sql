-- Dónde dijo el dueño que va a cobrar, al registrar el local: "computadora",
-- "tablet" o "celu". Null = local de antes de la pregunta, o creado sin el
-- asistente. Lo cuenta el Estudio para decidir cuándo construir el cobro en el
-- celu.
alter table kiosk_store add column if not exists cobra_en text;
