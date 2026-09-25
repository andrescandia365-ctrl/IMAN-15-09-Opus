# Noche — rama `noche-celu-caja`

## Resumen

1. **Hecho:** las 8 tareas. El celu ya puede ser la caja (rol decidido por el servidor, cobro, caja, planilla del día, pase de caja con toma forzada, "¿Dónde vas a cobrar?"), el gráfico por día en El mes, los pendientes chicos y los análisis. Todo en `noche-celu-caja`, nada pusheado.
2. **A medias / sin probar:** nada en un celu real; el asistente "Registrar más" con "Solo tengo celular".
3. **Hecho el 24-09, en `main` y en producción:** el bug del rubro (`ad81419` llevado solo, como `52beedc`).
4. **Hecho el 24-09, en la rama:** crear rubros desde el alta, Devolver en el celu que es la caja, la marca del arqueo heredado, y las notas de CLAUDE.md. Ver "Tanda del 24-09".
5. **Antes de pushear la rama:** Andres arma la base de Preview (una rama de Neon propia). Guía paso a paso en "La base de Preview", al final.
6. **Pregunta que sigue abierta:** actualizar la landing (el celu ya cobra).

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

---

## Tarea 4 — Paso d: pasar la caja

**Hecho.** Commit `8b9741a`.

- **Dueño → Local → "Pasar la caja a este aparato"**, con PIN y red.
- **Exige el turno cerrado.** Lo controla el servidor con los turnos de la
  fotocopia del local y los eventos `shift` de la cinta (`turnosAbiertos`: un
  turno cerrado en cualquiera de los dos lados queda cerrado; un turno nunca
  se reabre). Frena con un turno abierto por **otro** aparato, o con uno de
  antes de esta noche que no dice qué aparato lo abrió.
- **Toma forzada** (la caja de antes se rompió o se perdió): si el pase se
  frena por un turno abierto, el diálogo explica y ofrece "Forzar la toma",
  avisando que lo que ese aparato no subió no llega. Los turnos que quedaron
  abiertos quedan "heredados" en la caja nueva (`iman-caja-heredado:{local}`).
- **Turno ajeno en la caja** (heredado, o abierto por otro aparato): no se
  cobra, no se abre otro, no se devuelve. Se cierra en Caja contando la plata
  y después se abre uno propio. Esto aplica **solo en la caja**: en un local
  sin caja asignada, dos PC siguen compartiendo el turno como hoy.
- **La caja nueva sincroniza apenas toma la caja.** Lo encontré probando: sin
  esto, el celu veía abierto el turno que la PC ya había cerrado.

Probado en la app (una PC y un celu):
- la PC intenta tomar la caja con el turno viejo del local abierto: frenado;
  lo cierra y la toma; abre su turno;
- el celu intenta el pase con el turno de la PC abierto: frenado; la PC cierra
  y el celu pasa la caja; abre su turno y vende;
- el celu "se rompe" (sin red): la PC fuerza la toma; en el Mostrador aparece
  "Hay un turno abierto de otro aparato" y no puede confirmar; cierra el turno
  heredado contando ($15.000 + $2.500 de la venta del celu que había subido);
  abre el suyo y cobra;
- se volvió a pasar la prueba de dos aparatos de la tarea 2 (con la toma
  forzada), los cuatro checks y `qa:arranque`.

Decisiones que tomé solo (conservadoras):
- **Un turno abierto de antes de esta noche (sin aparato anotado) frena el
  pase normal**, aunque lo haya abierto el mismo aparato que pide la caja: no
  hay forma de saber de quién es. Se cierra y se vuelve a abrir, y el turno
  nuevo ya dice su aparato. Para un local que existe, la primera vez que
  asigne la caja va a tener que cerrar el turno.
- **En un turno ajeno se bloquea también "Devolver"**, no solo cobrar: una
  devolución movería el arqueo del turno heredado.

Límite conocido:
- **El servidor solo controla los turnos que ya le llegaron.** Si la caja de
  antes abrió un turno **sin red**, el pase normal lo deja pasar. Cuando ese
  aparato sincroniza, la caja nueva ve ese turno como ajeno y no puede cobrar
  en él hasta cerrarlo. No se mezclan ventas, pero hay un turno para cerrar
  que nadie esperaba.

Preguntas para Andres:
- ¿Está bien que la primera asignación de caja en un local existente pida
  cerrar el turno abierto (por ser de antes y no decir de qué aparato es)?
- En la toma forzada, el cierre del turno heredado va a descuadrar por las
  ventas que el aparato roto no subió. ¿Hace falta marcar ese cierre como
  "forzado" en el historial, para que el dueño no lo lea como un faltante?

No probado: en un celu real; con los dos aparatos perdiendo la red al mismo
tiempo que se pasa la caja.

---

## Tarea 5 — El asistente del primer arranque

**Hecho, con un cambio de lugar.** Commits `a358cca` (la pregunta) y
`ad81419` (un arreglo urgente que encontré en el camino, ver abajo).

**Por qué no está solo en el asistente:** una cuenta nueva **nunca pasa por
el asistente de locales**. Al crear la cuenta, el servidor le da un local
"Local" (`claimOwnerRow`, `owners.ts`), y la cuenta cae directo en la lista de
locales. Lo verifiqué antes de la noche. Si la pregunta viviera solo ahí, casi
nadie la vería. Tomé la opción conservadora que había propuesto:

- **La pregunta aparece la primera vez que se entra a un local que no la
  contestó** (`donde-cobras.tsx`), con "Después" para no trabar a nadie con un
  cliente enfrente (si pospone, se pregunta de nuevo la próxima vez).
- **También queda en el asistente**, para los locales que se registran por ahí.

**Qué hace cada respuesta:**
- **"Solo tengo celular", contestado desde un celu, en un local nuevo** (que
  nunca tuvo caja y nunca vendió): ese celu queda como caja, sin PIN (un local
  nuevo todavía no tiene PIN). Aviso: "Este celu va a ser la caja del local…".
- **"Solo tengo celular" en un local que ya vende, o con caja:** se guarda la
  respuesta, pero **no se asigna la caja sola**, porque le cortaría la caja a
  otro aparato en medio del día. Aviso: pasala desde Dueño → Local, con PIN.
- **"Solo tengo celular" desde una PC:** se guarda y se explica cómo pasarle la
  caja al celu.
- **Computadora o Tablet:** se guarda; el local sigue como siempre (sin caja
  anotada, cobra la pantalla de PC; una tablet de 640 px o más cuenta como PC).

**El Estudio** muestra "¿Dónde cobran?": cuántos locales eligieron cada
opción, y cuántos no contestaron. Dato en `kiosk_store.cobra_en` (migración
`0017_cobra_en.sql`).

**CLAUDE.md:** las invariantes 3 y 4 reescritas con el modelo de una sola caja
por local, sobre la propuesta del análisis anterior.

Probado en la app:
- cuenta nueva desde un celu: pregunta al abrir "Local"; "Solo tengo celular"
  la deja como caja, con las pestañas de caja; al recargar no pregunta de nuevo;
- cuenta nueva desde una PC: "Computadora", se cierra y cobra como siempre;
- cuenta nueva que vende en la PC (posponiendo la pregunta) y después contesta
  desde el celu "Solo tengo celular": no asigna la caja, avisa cómo pasarla, el
  celu queda de piso;
- el Estudio cuenta 2 computadora / 0 tablet / 1 celu / 0 sin responder;
- los cuatro checks, `qa:arranque`.

**Dos cosas que encontré y arreglé:**
- **URGENTE — en `main`: en un local recién creado no se puede dar de alta
  ningún producto.** La regla del rubro obligatorio (`1d0ad0e`, `9b4827b`, ya
  pusheadas) traba el alta cuando el local no tiene rubros, y un local nuevo
  arranca sin rubros: "Guardar" dice "Falta el rubro" para siempre. Arreglado
  en la rama (`ad81419`): sin rubros, el alta no lo exige y el producto queda
  sin rubro (como antes de la regla). **Esto conviene llevarlo a `main` antes
  que el resto.**
- `seed:prueba` se trababa con el diálogo nuevo; ahora contesta
  "computadora".

**Para Andres — actualizar la landing:** ahora un kiosco que solo tiene celular
**puede cobrar**: el celu es la caja (cobra, turno, retiros, cierre, planilla
del día). La landing no puede seguir diciendo que hace falta una computadora.

Preguntas para Andres:
- ¿Está bien que la pregunta aparezca al entrar al local (en vez de un
  asistente de primer arranque, que hoy no existe para cuentas nuevas)?
- Un kiosco solo celu **no puede crear rubros** desde el celu (Categorías está
  solo en Inventario de la PC). Sus productos quedan sin rubro. ¿Hace falta
  una pantalla de rubros en el celu?

No probado: el asistente de locales ("Registrar más") con "Solo tengo celular"
desde un celu: hace falta una cuenta con más de un local en el plan, y no la
armé. El código es el mismo camino del servidor (asigna la caja al crear el
local); en un celu real, nada.

---

## Tarea 6 — El gráfico de líneas en El mes

**Hecho.** Commit `e7e890f`.

- En Dueño → El mes, una tarjeta **"Ventas por día"**: el total de cada día del
  mes elegido (línea de acento) contra otro mes (gris punteado; por defecto el
  anterior, elegible entre los seis anteriores y el mismo mes del año pasado).
  Días del 1 al 31. El pico y el valle del mes van escritos; el resto, al pasar
  el dedo (tooltip con los dos meses).
- Recharts, colores de los tokens, modo claro y oscuro. **Sin datos, un texto**
  ("De estos meses no quedan ventas por día"), nunca un gráfico vacío.

**El límite de los datos (importante):** las ventas sueltas se guardan solo
7 días; las más viejas se pliegan en un total por mes, **sin el día**. Para los
días viejos usé los **turnos cerrados** (cada uno trae lo que vendió), en el día
local en que se abrieron. Se guardan 90 turnos: alcanza para uno o dos meses
según cuántos turnos haga el local. Un día sin ventas ni turnos queda como
**hueco** en la línea, no como cero (puede haber vendido y ya no quedar el
detalle). Guardar el total por día en el resumen plegado lo resolvería para
siempre, pero es tocar el plegado ("qué no se toca"): lo dejé anotado en
Pendientes, necesita GO.

Probado en la app: cargué en la copia del aparato 40 días de turnos cerrados
(con domingos cerrados) y 6 días de ventas; PC en oscuro y en claro, tooltip,
celu, y una cuenta nueva sin ventas (muestra el texto). Tests de la cuenta por
día (`ventas-dia.test.ts`).

Decisiones que tomé solo:
- **Tooltip.** El gráfico de barras de al lado tiene la regla "nada de
  tooltips, los montos van escritos". Con 31 puntos no entran escritos: escribí
  solo el pico y el valle, y el resto va al pasar el dedo.
- **Los colores de marca no pasan el "piso de saturación"** del validador de
  paletas (el verde es apagado a propósito). Pasan lo que importa para
  distinguir las dos líneas (daltonismo, contraste). Para no depender solo del
  color, la línea de comparación va punteada.

Preguntas para Andres:
- ¿Guardamos el total por día en el resumen plegado (toca el plegado) para
  poder comparar meses viejos por día?

---

## Tarea 7 — Pendientes chicos y seguros

**Hecho.** Commits `b37086e` (Caja) y `56f12c0` (el contador).

- **La nota del cierre de turno:** un campo "Nota del cierre (opcional)" en el
  diálogo de cierre. `closeShift` ya la aceptaba; viaja en el evento `shift` y
  sale en el historial. Probado: se cierra con "Faltó un billete de 100" y la
  nota aparece en el historial de la PC que cerró y en el de otra PC después
  de sincronizar.
- **Los labels de Caja:** todos atados a su campo con `htmlFor` (fondo,
  retiro, contado, caja fuerte, cargas del celular, SUBE, nota).
- **"Bajaron N cambios":** al juntar dos fotocopias, lo que se adopta de la
  otra (turnos, retiros, historial de stock) no se contaba. Ahora sí
  (`registrosNuevos`, con test). Probado: con otra PC que vendió, retiró y
  cerró, antes decía "Bajaron 3 cambios" (solo la cinta) y ahora "Bajaron 4".
  No reproduje el caso exacto de "cero" (cuando todo llega solo por la
  fotocopia); la cuenta nueva lo cubre y está en el test.
- **Los 9 tests de `test:platform`:**
  - **8 de `grok-pwa-plugin.test.mjs`: el plugin NO es código muerto.**
    `vite.config.ts` lo usa en cada build (sirve el service worker de IMAN e
    inyecta las etiquetas del `<head>`), así que no lo borré. **La causa:** el
    plugin lee la identidad del sitio de `src/lib/og/site.json` en la carpeta de
    trabajo, y en este repo ese archivo dice "IMAN" con tarjeta propia; los
    tests son de la plantilla de Grok y esperan que no exista (por ejemplo,
    esperan `og:title = "Hello World"` y el plugin, correctamente, pone "IMAN").
    **Verificado:** corridos desde una carpeta vacía, pasan los 47. El arreglo
    sería que esos tests usen una carpeta de trabajo propia (con un archivo de
    identidad de prueba). No lo hice porque la instrucción era borrarlos solo si
    el código estaba muerto.
  - **1 del esquema de auth (`migration-plan.test.mjs`, "the auth schema ships
    outside the globbed directory"): no lo toqué.** Afirma que la carpeta
    `migrations/` no tiene ningún `.sql` suelto, cosa que solo es cierta en la
    plantilla vacía; este repo tiene las migraciones 0001 a 0017 ahí, así que
    falla desde la primera. **La parte que importa sí se cumple:** el esquema de
    auth está en `migrations/auth/0001_auth.sql`, y el test que verifica que la
    copia de `migrations/0001_auth.sql` es idéntica al original **pasa**. No hay
    un problema de auth, es un test de plantilla.

Preguntas para Andres:
- ¿Arreglo los 8 tests del plugin para que usen una carpeta de prueba, y el de
  auth para que mire solo lo que importa (que el esquema esté en
  `migrations/auth/` y que la copia sea idéntica)? Así `test:platform` quedaría
  en verde y serviría para algo.

---

## Tarea 8 — Análisis (sin código)

### 1. La lógica de vencimientos, en celu y PC

**Cómo funciona hoy.**
- Un producto tiene **lotes** (`lots`: fecha, unidades, alta) o, si no tiene
  lotes, una sola fecha (`expiresAt`). Con lotes, `expiresAt` es la del lote que
  vence primero.
- **Fechar** (`dateLot`, evento `lot`) agrega un lote. Llegó puede cargar la
  fecha al recibir.
- **Vender** descuenta del lote que vence primero (`consumeFifo`), entre los
  que ya existían a la hora de la venta.
- **Celu, pestaña Vence:** lista **cada lote** con su fecha y unidades, ordenado
  por fecha, con "Vencido" en rojo.
- **PC, Inventario → Vencimientos:** lista **productos** (no lotes) con
  `expiresAt` a 7 días o menos, contando los ya vencidos.
- **Sugerencias:** "Oferta: …" para lo que vence en 10 días o menos.

**Problemas.**
- **Celu y PC muestran cosas distintas:** el celu, cada lote y sin límite de
  días; la PC, solo el lote más próximo de cada producto y solo a 7 días. El
  mismo producto con dos lotes aparece dos veces en el celu y una en la PC.
- **Tres ventanas distintas:** 7 días (PC), 10 días (Sugerencias), sin límite
  (celu). No hay una regla.
- **Ajustar stock no toca los lotes:** una merma o un ajuste negativo baja el
  stock pero no los lotes, y quedan lotes con más unidades que el stock.
  `unallocated` lo tapa con un `max(0, …)`.
- **Lo vencido no tiene salida:** no hay "retirar lo vencido" (merma con motivo
  vencido) ni "devolver al proveedor" desde Vence. El producto vencido se sigue
  vendiendo sin aviso en el mostrador.
- **Los lotes divergen entre aparatos** (ver el punto 4).

**Propuesta.**
1. **Una regla de "por vencer", en el local:** un número de días (por defecto
   10) en Ajustes, que usen el celu, la PC y Sugerencias.
2. **La misma lista en los dos**, por lote, agrupada por producto (el celu en
   lista, la PC en tabla).
3. **Acciones sobre un lote vencido o por vencer:** "Retirar" (baja stock y
   lote con motivo `vencido`, que después se ve en El mes como pérdida),
   "Devolver al proveedor" (la devolución que ya existe) y "Poner en oferta".
4. **Aviso al vender** un producto con el lote más próximo ya vencido (no
   bloquear: avisar).
5. **Que el ajuste negativo descuente también de los lotes** (el que vence
   primero), igual que una venta.

### 2. Sugerencias en Inventario y los carteles de promos

**Qué hay hoy.** `buildSuggestions` arma hasta 12 tarjetas: "Oferta" (vence en
10 días o menos), "está en oferta" (recordarle al que atiende), "Se está yendo"
(8 o más vendidas en la semana y stock bajo) y "Hoy pasa [proveedor]". La única
acción es "Poner en oferta", que prende una marca (`onOffer`) sin precio de
oferta. Para imprimir hay etiquetas de góndola (grilla A4 con nombre, precio y
código), lista de precios y hoja de códigos cortos. **No hay carteles ni
afiches.** Detalle: la tarjeta muestra el tipo en inglés ("offer", "stock",
"order", "shift"), cosa que las reglas de copy prohíben.

**Propuesta concreta.**
1. **Precio de oferta de verdad:** "Poner en oferta" pide precio (o % de
   descuento) y hasta cuándo. Viaja por la cinta (un tipo nuevo, `oferta`, para
   no tocar el body de `product`). El Mostrador cobra el precio de oferta y el
   ticket lo muestra.
2. **Más sugerencias, cada una con su acción:** lo que no se vende hace 30
   días ("liquidar"), combos de lo que se vende junto, precio viejo (hace más de
   N días sin actualizar), faltante de algo que se vende todos los días.
3. **Herramienta de carteles, en Inventario → Carteles:**
   - Plantillas: **Oferta** (precio tachado → precio nuevo), **2×1 / 3×2**,
     **Liquidación**, **Nuevo**, **Precio por kilo**, y un **aviso libre**
     ("Cerrado el domingo").
   - Tamaños: **A4 vertical** (afiche de vidriera), **A5** (heladera),
     **tira de góndola** (4 por A4), **mini para exhibidor**.
   - Arma el cartel del producto elegido (o de todos los que están en oferta),
     con la marca del local (nombre, logo si lo cargó) y colores de IMAN; vista
     previa y "Imprimir" (el mismo `window.print` de las etiquetas, que ya
     anda en cualquier impresora común).
   - Desde una sugerencia de oferta: "Poner en oferta e imprimir el cartel", en
     un solo gesto.
   - En el celu (sin impresora): "Compartir" el cartel como imagen, para
     mandarlo a imprimir o por WhatsApp.

### 3. La cinta que crece sin techo en el servidor

**Hoy.** `kiosk_event` guarda cada evento para siempre. Un aparato baja desde
su cursor (`seq`). Un aparato nuevo no necesita la historia: arranca de la
fotocopia (sigue desde su marca) o "saltea" (toma el estado de ahora). La
historia vieja solo le sirve a un aparato **atrasado**, cuyo cursor quedó
detrás.

**Cómo recortarla sin perder nada.**
1. **Que el servidor sepa hasta dónde bajó cada aparato:** `pullEvents` ya
   recibe el cursor; sumarle el `deviceId` y guardar `(local, aparato) →
   último seq y fecha`.
2. **El piso seguro de un local** = el menor cursor entre los aparatos
   **activos** (bajaron en los últimos 60 días), y nunca por encima del `seq`
   de la marca de la última fotocopia (lo anterior ya está en la foto).
3. **Borrar** los eventos con `seq` menor al piso **y** más viejos que 90 días
   (doble condición), en una tarea diaria, por tandas.
4. **Un aparato que vuelve después del recorte** (cursor menor al piso): el
   servidor lo avisa en `pullEvents` (`cortada: true`) y el aparato **junta la
   fotocopia** (el camino de "arranque desde la fotocopia" que ya existe:
   `mergePayload` + seguir desde la marca) en lugar de bajar la cinta. No se
   pierde nada: lo que no está en la cinta está en la foto.
5. **Antes de borrar**, medir: cuántas filas y cuánto pesa por local (el
   Taller ya muestra el total). Si una tabla de archivo en frío sale gratis, se
   puede mover en vez de borrar.

### 4. Los lotes distintos entre aparatos

**Por qué pasa.** El evento `sale` no dice de qué lote salió cada unidad: cada
aparato corre `consumeFifo` con **sus propios lotes**. Si los aparatos no
tienen los mismos lotes en ese momento, descuentan de lotes distintos:
- un lote fechado en el celu que la PC todavía no bajó (`existiaAl` usa la
  hora del lote y de la venta, pero si el lote se cargó con la hora mal o llegó
  tarde, igual cambia el orden);
- un ajuste de stock que baja el stock pero no los lotes (punto 1);
- la edición de un lote (`setLot`) y su orden respecto de las ventas;
- relojes distintos entre aparatos (`asOf` compara horas de dos relojes).

**Propuesta.**
1. **La caja decide el lote**: al cobrar, la caja guarda en la venta cómo
   repartió las unidades (`lotes: [{ lotId, units }]`). Es un campo nuevo del
   body de `sale` (se agrega, no se achica: el aparato viejo lo ignora y sigue
   con FIFO). Los aparatos nuevos aplican ese reparto tal cual, en vez de
   recalcularlo.
2. **La caja es la dueña de los lotes**: si un aparato de piso tiene lotes
   distintos, al sincronizar adopta los de la fotocopia de la caja (como ya se
   adoptan turnos y retiros).
3. **El ajuste negativo descuenta de los lotes** (punto 1.5), con el reparto
   en el evento `stock`, igual que la venta.

### 5. El riesgo de Preview contra la base de producción

**Hoy.** Las variables de Vercel (`DATABASE_URL`, `DATABASE_MIGRATE_URL`)
están en Production y en Preview con la misma base. Pushear cualquier rama
arma una vista previa que: (a) **corre las migraciones contra Neon de
producción** en el build (`npm run build` → `db:migrate`), y (b) **escribe en
la base de producción** desde la vista previa (cualquiera que entre ahí con su
cuenta toca datos reales). Por eso esta noche nada se pusheó.

**Cómo separarlo, de menor a mayor esfuerzo.**
1. **Ya: sacar las variables de base de Preview** en Vercel. Sin
   `DATABASE_URL`, la app usa PGLite (base en memoria, como en desarrollo) y
   `db:migrate` se saltea solo (ya está programado así). La vista previa sirve
   para mirar pantallas, no para datos. Riesgo cero para producción.
2. **Mejor: una rama de Neon por vista previa** (la integración oficial de
   Neon con Vercel). Cada vista previa tiene su copia de la base (copy-on-write,
   gratis en el plan chico), corre sus migraciones ahí y se borra con la rama.
   Permite probar migraciones con datos parecidos a los reales.
3. **Además, un freno en el código**: que `scripts/migrate.mjs` se niegue a
   migrar si `VERCEL_ENV` no es `production`, salvo que la variable de la
   rama de Neon esté puesta. Así, aunque alguien vuelva a cargar mal una
   variable, las migraciones no tocan producción desde una rama.
4. **Opcional:** en Vercel, "Ignored Build Step" para no armar vista previa de
   ramas de trabajo (solo de las que empiezan con `preview/`).

**Recomendación:** hacer el 1 antes de pushear `noche-celu-caja` (tiene dos
migraciones), y el 3 como red. El 2 cuando haga falta probar migraciones
contra datos reales.

---

## Tanda del 24-09 — las respuestas de Andres

Las respuestas: la pregunta "¿Dónde vas a cobrar?" queda; la primera
asignación de caja puede pedir el turno cerrado; el total por día en el
plegado, todavía no; los tests de `test:platform` no se arreglan.

### El bug del rubro, a `main`

`ad81419` llevado solo con cherry-pick: `52beedc`, pusheado. Probado con una
cuenta recién creada, sin rubros: alta de un producto en PC y en celu.

### Crear un rubro desde el alta — `1735718`

La fila de rubros del alta tiene "+ Rubro nuevo", en PC y en celu. Si ya
existe un rubro con ese nombre (sin importar mayúsculas), lo elige y no lo
duplica. Viaja con el evento `category` que ya existía.

Probado: cuenta nueva, la PC crea "Golosinas"; escribir "golosinas " elige el
existente; el celu, después de Sincronizar, ve "Golosinas" y crea "Bebidas".

### Devolver en el celu que es la caja — `3471178`

En Vender, arriba del ticket, "Devolver" abre el mismo diálogo de la PC. Solo
lo ve la caja. Con un turno ajeno abierto no aparece. Con la caja cerrada
avisa "Abrí la caja para devolver plata" antes de abrir el diálogo.

Probado en un celu simulado:
- De piso no ve Devolver.
- Toma la caja forzando. Con el turno heredado abierto no lo ve.
- Cierra el turno heredado. Con la caja cerrada, aviso.
- Abre la caja y devuelve 2 Havanna en efectivo: devolución de $5.000 dentro del
  turno, stock de 20 a 22.

### La marca del arqueo heredado — `c193283`

El historial de Caja dice "Lo cerró otro aparato, no el que abrió el turno".
El turno cerrado lleva dos campos nuevos:
- `closedBy`: el aparato que cerró.
- `heredado`: si se cerró después de forzar la toma.

`heredado` hace falta porque los turnos abiertos antes de esta rama no dicen
qué aparato los abrió. En producción, hoy, son todos. Viaja en el evento
`shift` que ya existía: solo se agregan campos. Un aparato viejo guarda el
turno entero y no muestra la marca hasta que se actualice.

Probado con PC y celu:
- La PC cierra un turno propio: sin marca.
- La PC abre otro. El celu fuerza la toma y lo cierra: marca en el celu.
- Después de sincronizar los dos, la marca aparece en la PC, solo en ese turno.

### CLAUDE.md — `97ad873`

- `test:platform`, en "Verificación": sus 9 tests son de la plataforma Grok y
  fallan por diseño. Salió de Pendientes.
- El total por día en el plegado sigue en Pendientes con "Andres: todavía no".

Cada commit: los cuatro checks en verde (284 tests) y `qa:arranque` OK.

---

## La base de Preview — paso a paso para Andres

**Qué se busca.** Hoy Production y Preview comparten las variables. Pushear
esta rama arma una vista previa, y esa vista corre las migraciones `0016` y
`0017` contra la base real. La idea es que Preview tenga **su propia rama de
Neon**: una copia de la base, aparte. Se puede probar con dos aparatos y un
celu real sin tocar a ningún kiosco.

Van a hacer falta dos pestañas abiertas: Neon (console.neon.tech) y Vercel
(vercel.com), con el proyecto `iman2`.

### A. En Neon: crear la rama `preview`

1. Entrá a console.neon.tech y abrí el proyecto de IMAN.
2. En el menú de la izquierda, **Branches**. Vas a ver la rama de producción
   (casi seguro se llama `main` o `production`, con la etiqueta "Default").
3. Arriba a la derecha, **New branch** (o "Create branch").
4. Completá:
   - **Name:** `preview`
   - **Parent branch:** la de producción, la que dice "Default".
   - **Include data:** "Current data" (o "Head"): copia la base como está hoy.
   - Si aparece **"Automatically delete branch after…"** o un vencimiento,
     **destildalo**: si no, la rama se borra sola.
5. **Create branch.**
6. Te muestra la conexión. Si no, en la rama `preview`, botón **Connect**.
   - En la ventana de conexión, elegí **Branch: preview**. Fijate bien: por
     defecto muestra la de producción.
   - Con **"Connection pooling" prendido**, copiá la cadena completa
     (`postgresql://…-pooler…`). Esa es la **DATABASE_URL de Preview**.
   - Con **"Connection pooling" apagado**, copiá la otra (sin `-pooler`). Esa es
     la **DATABASE_MIGRATE_URL de Preview**.
   - Guardá las dos en un lugar seguro: tienen la contraseña de la base.

Ojo: la rama `preview` copia los datos reales. Para probar, usá cuentas de
prueba, no las de los kioscos. Si más adelante querés refrescarla con los
datos de hoy: Branches → `preview` → **Reset from parent**. Borra lo que se
probó ahí.

### B. En Vercel: que Preview use esa rama

1. Entrá a vercel.com, abrí el proyecto `iman2` → **Settings** → **Environment
   Variables**.
2. Buscá estas cuatro. Cada una muestra al lado en qué entornos vale:
   `DATABASE_URL`, `DATABASE_MIGRATE_URL`, `BETTER_AUTH_URL`,
   `BETTER_AUTH_SECRET`.
3. Para cada una de las cuatro:
   - Menú de los tres puntos → **Edit**.
   - En "Environments", **destildá Preview** y dejá solo Production.
   - **No cambies el valor.** Save.
4. Ahora agregá las de Preview. Botón **Add New** (o "Add Environment
   Variable"). En cada una, en Environments, **solo Preview**:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | la cadena con pooling de la rama `preview` (paso A.6) |
   | `DATABASE_MIGRATE_URL` | la cadena sin pooling de la rama `preview` |
   | `BETTER_AUTH_SECRET` | una clave nueva: 32 letras y números al azar (en una terminal: `openssl rand -base64 32`). **No uses la de producción.** |

5. `BETTER_AUTH_URL` va aparte, porque es la dirección de la vista previa y
   cambia por rama. Add New:
   - Key `BETTER_AUTH_URL`, Environments **solo Preview**.
   - Donde dice "Preview", elegí **una rama específica** ("Select a custom
     Preview branch" o el desplegable de Git branch) y escribí
     `noche-celu-caja`.
   - Value: `https://iman2-git-noche-celu-caja-<equipo>.vercel.app`, donde
     `<equipo>` es el nombre corto de tu cuenta en Vercel. Si no sabés cuál
     es, dejalo así: en el paso C se corrige.
6. Si querés el Estudio en la vista previa: `IMAN_ESTUDIO_PASSWORD`, solo
   Preview, con una clave distinta a la de producción.
7. Revisá que **todas las demás** variables (`VITE_AUTH_ENABLED` y las que
   haya) sigan tildadas en Preview. Esas no se tocan.

Las variables nuevas valen recién desde el próximo deploy. Nada cambia en
producción: Production quedó con las mismas variables de siempre.

### C. Cuando me digas, pusheo la rama y revisamos juntos

1. Me avisás y pusheo `noche-celu-caja`. Vercel arma la vista previa sola.
2. En Vercel → **Deployments**, abrí el deploy de `noche-celu-caja` →
   **Building / Build Logs**. Al final tienen que aparecer `0016_caja` y
   `0017_cobra_en` aplicadas. Mirá en Neon, rama `preview` → **Tables** →
   `kiosk_store`: tiene que tener la columna `caja_device`. En la rama de
   producción, **no**.
3. Copiá la dirección que muestra el deploy en "Domains", la que tiene
   `-git-noche-celu-caja-`. Si no es igual a la que pusiste en
   `BETTER_AUTH_URL`, corregí la variable y en el deploy, menú → **Redeploy**.
   Sin eso, entrar con la cuenta da "Invalid origin".
4. **Deployment Protection:** la vista previa pide iniciar sesión en Vercel.
   En el celu real, entrá con tu cuenta de Vercel en el navegador, o en el
   deploy usá **Share** para sacar un link que se pueda abrir sin login.

**Si algo sale mal:** borrar las variables de Preview y la rama de Neon no
toca producción. Lo único que no hay que hacer es pushear la rama antes de
terminar el paso B.
