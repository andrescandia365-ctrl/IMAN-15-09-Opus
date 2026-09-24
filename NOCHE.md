# Noche — rama `noche-celu-caja`

## Resumen

_(se completa al terminar)_

## Reglas que seguí

- Todo en la rama `noche-celu-caja`, creada desde `main` (26dad46). `main` no se tocó.
- Nada pusheado: ni `main` ni la rama.
- Solo la base local de desarrollo (PGLite en memoria del `npm run dev:local`).
- Sin tocar `iman-floor-lock` ni la condición `onFloor`/`licensed` de `app.tsx`.
- El trabajo sin commitear de la pregunta "¿Dónde vas a cobrar?" (de antes de la
  noche) quedó guardado en un stash con nombre, `cobra-en: pregunta del
  asistente sin commitear (tarea 5)`, y se retoma en la tarea 5.

---

## Tarea 1 — Que ningún pendiente se pierda

**Hecho.** En CLAUDE.md, dentro de "Falta hacer", una sección "Pendientes" con
toda la lista, una línea por ítem, agrupada como la mandó Andres: decisiones de
Andres, producto, técnico, a probar en un celu real, y fuera del código.

- Commit: `de2670d`.
- Decisiones propias: agregué una frase arriba de la lista: "al resolver uno,
  se saca de acá en el mismo commit", para que la lista no quede vieja.
- Preguntas: ninguna.

---

## Tarea 2 — Paso b: el rol de caja lo decide el servidor

**Hecho.** Commit `d2b9fc4`.

Qué quedó:
- **Servidor.** Migración `0016_caja.sql` (idempotente, `add column if not
  exists`): `caja_device`, `caja_ver`, `caja_desde` en `kiosk_store`.
  `tomarCaja` verifica el hash del PIN del dueño contra el del local y cambia
  la caja solo si `caja_ver` es la que el aparato esperaba (como el `rev` de la
  fotocopia). La caja viaja en las respuestas de `pushEvents` y `pullEvents`, en
  la carga del local (`loadAccount`, `selectStore`) y en `verCaja`.
- **Aparato.** Lo que sabe de la caja vive en `iman-caja:{local}`
  (localStorage), aparte de `iman-floor-lock`. `rol.ts` separa las dos cosas:
  el ancho decide la disposición, el rol los permisos (`puedeCobrar`).
- **Se entera de un cambio** al subir o bajar la cinta, al volver a la app, al
  volver la red, y cada 2 minutos con la app a la vista (`verCaja`).
- **Tomar la caja:** Dueño → Local → "Tomar la caja en este aparato", con red
  y PIN.
- **PC de piso:** el panel de cobro muestra el medio de pago y "Enviar a la
  caja"; sin "Recibir", vuelto, abrir caja, devolver ni F4. No recibe tickets
  de otros aparatos. En Caja no puede abrir, retirar ni cerrar.
- **Nunca en medio de una venta:** si la PC deja de ser la caja con un ticket
  a medias, ese ticket se termina de cobrar; el siguiente ya va a la caja.
- **Sincronizar:** la dirección la decide el rol (la caja sube primero).
- **Transición:** un local sin caja anotada se comporta exactamente como hoy.

Probado en la app, con dos PC (dos navegadores, la misma cuenta):
- sin caja asignada, las dos cobran (como hoy);
- A toma la caja → B pasa a "Enviar a la caja";
- con A sin red, B toma la caja; A no se entera, **sigue cobrando sin red y
  abre turno sin red**; al volver la red se entera y pasa a piso;
- A con un ticket a medias cuando se entera: termina esa venta; la siguiente
  ya es "Enviar a la caja";
- las ventas que A hizo sin red llegan a B por la cinta;
- una toma con versión vieja la rechaza el servidor (antes de agregar la
  consulta previa de la versión);
- el celu que manda el ticket a la PC sigue igual en un local sin caja;
- los cuatro checks, `qa:arranque`.

Decisiones que tomé solo (conservadoras, fáciles de revertir):
- **Antes de tomar la caja, el aparato pregunta la versión de ahora.** Sin
  esto, un aparato que no se enteró de un cambio recibía "Otro aparato cambió
  la caja recién", que confunde. La protección sigue: si alguien la cambia
  entre la consulta y la toma, falla igual.
- **La consulta periódica (`verCaja`) cada 2 minutos.** Sin ella, un aparato
  quieto se enteraba recién al sincronizar. Es una consulta chica; si Neon la
  siente, se sube el intervalo.
- **La PC de piso puede seguir viendo la pestaña Caja** (la planilla), pero no
  abrir, retirar ni cerrar.
- **El PIN se verifica en el servidor** contra el hash guardado en la
  fotocopia del local. Si el dueño creó el PIN y no sincronizó, el mensaje le
  dice que sincronice.

Cosas que encontré:
- **El servidor de desarrollo no aplica migraciones nuevas sin reiniciar**
  (las aplica una vez por arranque). Lo reinicié dos veces con
  `npm run dev:local`. Estaba corriendo desde hacía 3 días con `npm run dev`
  (sin `.env.local`); ahora corre con `dev:local`.
- **`seed:prueba` no borra la caja anotada.** Después de una prueba de caja,
  el local de pruebas sigue con la caja en el aparato de esa prueba. Para
  volver a "sin caja" hay que reiniciar el servidor (la base es en memoria).
- En producción las migraciones corren en el build (`npm run build` →
  `db:migrate`) antes del despliegue, así que esto no pasa ahí. Pero ojo con
  el riesgo de Preview anotado en Pendientes.

Preguntas para Andres: ninguna nueva en esta tarea.

No probado: en un celu real; con muchos aparatos (probé dos).

---

## Tarea 3 — El mínimo de un kiosco solo celu

**Hecho.** Commit `76fa843`.

Cuando el celu **es la caja**:
- **Cobrar:** medio de pago, "Cuánto pagó" (con billetes de un toque), vuelto
  y "Confirmar venta" que hace `checkout` de verdad (con `shiftId`, `deviceId`
  y turno abierto). Si la caja está cerrada, ofrece abrirla desde Vender.
- **Recibe los tickets de otros aparatos** ("Ticket de otro aparato ·
  Ponerlo acá"; si ya hay un ticket armado, los suma).
- **Caja:** la misma pantalla de la PC (turno, retiros, cierre contando la
  plata, historial) con la **planilla de un día en lista** (`LedgerDia`), con
  flechas para ir a días anteriores.
- **Más:** Llegó, Vence, **Actualizar precios** (la de la PC) e **Importar
  catálogo** (el mismo diálogo de la PC, eligiendo un archivo).
- **Stock, alta, Llegó y Vence:** los que ya existían.
- **El recibo no muestra "Imprimir" en el celu.**

**Las pestañas (5):** Vender · Caja · Stock · Más · Dueño. Por qué: cobrar y
la caja son lo de todos los días y quedan a un toque; Stock se usa seguido;
Llegó, Vence, Actualizar precios e Importar son de a ratos y van a Más. Dueño
queda donde está siempre.

Cuando el celu **no es la caja**: igual que antes. Arma el ticket, elige
medio de pago y lo manda. Dice "Enviar a la PC" si el local no tiene caja
asignada y "Enviar a la caja" si la tiene. Nunca muestra "Confirmar venta",
"Cuánto pagó" ni el vuelto.

Probado en la app (celu simulado Pixel 5, PC y otro celu, la misma cuenta):
- el celu toma la caja → pestañas Vender · Caja · Stock · Más · Dueño;
- venta en efectivo: pagó $10.000, vuelto $4.300, la venta queda con turno y
  aparato; el recibo sin "Imprimir";
- retiro de $2.000, cierre contando: esperado $18.700 ($15.000 + $5.700 −
  $2.000), cuadra;
- con la caja cerrada, Vender avisa y no deja confirmar; abrir desde Vender y
  cobrar con MP;
- planilla del día: un valor cargado sigue después de recargar;
- Actualizar precios abre; importar un CSV agrega el producto;
- la PC de piso manda un ticket y el celu lo recibe y lo pone en su ticket;
- otro celu, de piso: pestañas de siempre, "Enviar a la caja", sin cobro;
- se volvieron a pasar las pruebas del escáner, del flujo del celu a la PC y
  `qa:arranque`.

Decisiones que tomé solo:
- **Las devoluciones en el celu que es la caja:** quedan las del recibo
  (botón "Devolver 1" en cada renglón, que ya existía). No agregué el diálogo
  "Devolver" suelto del Mostrador: no estaba en la lista del mínimo.
- **La planilla del día llega hasta hoy**: las flechas no dejan pasar a días
  futuros.

Preguntas para Andres:
- ¿El celu que es la caja necesita el "Devolver" suelto (sin ticket) del
  Mostrador? Hoy solo puede devolver desde el recibo de la venta.

No probado: en un celu real (tamaños de toque, el teclado numérico, el
selector de archivos del celu para importar).
