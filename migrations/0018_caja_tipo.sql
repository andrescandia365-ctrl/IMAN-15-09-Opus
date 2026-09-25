-- Qué tipo de aparato es la caja: "celu", "tablet" o "computadora". Lo manda
-- el aparato al tomar la caja, para que el panel del dueño diga "un celular"
-- en lugar de un código. Null = caja tomada antes de esta columna.
alter table kiosk_store add column if not exists caja_tipo text;
