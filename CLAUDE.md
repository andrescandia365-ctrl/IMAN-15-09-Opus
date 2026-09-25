# IMAN — contexto para Claude Code

POS + caja + stock + vencimientos para kioscos y almacenes argentinos.
Es solo software: se vende la licencia de 12 / 24 / 36 meses (1 / 2 / 3 seats).
No se vende lector ni impresora, no hay proveedor. Un lector que el local ya
tenga anda en modo teclado. El kiosco sin PC no imprime ticket.

**Slogan:** Números claros. Local que crece.

---

## LEER PRIMERO

**`AGENTS.md` NO aplica.** Ese archivo es el contrato del sandbox de Grok Build
(App Builder): habla de `/workspace`, `startup.sh`, preview en el puerto 8080,
skills en `.grok/`, herramientas `imagine_*` y de cuándo scaffoldear una app
nueva. Nada de eso corre acá. Ignoralo completo, junto con la carpeta `.grok/`.

**`IMAN_HANDOFF.txt`** sí es válido para producto e invariantes. Está fechado
el 15-09: el mapa de archivos, la cinta y lo que se construyó después viven
acá. Su advertencia de "no adjuntes .tsx" era para chats que rechazan
archivos: acá tenés el repo entero, leé los archivos directo.

**Nunca scaffoldear una app nueva.** Este workspace ya existe y está andando.

---

## Comandos

```bash
npm run dev:local      # dev cargando .env.local (ahí vive IMAN_ESTUDIO_PASSWORD)
npm run dev            # dev en 0.0.0.0:8080
npm run seed:prueba    # deja el local de pruebas listo
npm run build          # vite build + headers del SW + db:migrate
npm run db:migrate
```

### Verificación obligatoria antes de decir que terminaste

```bash
npm run typecheck && npm run check:auth && npm test && npm run lint
```

No declares una tarea lista sin correr los cuatro. `check:auth` existe porque
las invariantes de auth ya se rompieron antes.

`npm run test:platform` **no** es parte de la verificación: sus 9 tests fallan
por diseño en este repo. Son de la plataforma Grok (su plugin y su esquema de
auth), no de IMAN. No se arreglan.

**Los cuatro checks no prueban que la app funcione.** Una función que envuelve
una API del navegador con contrato de corrientes (streams) no queda probada por
un test unitario: los tests corren en Node, y Node y el navegador no se portan
igual.

El caso que lo enseñó: `gzipJsonToB64` hacía `await writer.write()` sobre un
`CompressionStream` antes de que nadie leyera del otro lado. En Node eso
resuelve; **en el navegador no resuelve nunca**. Había un test que llamaba a
`encodeCopyPayload` con una corriente de verdad y pasaba en verde, mientras en
producción el botón Sincronizar quedaba girando y ninguna fotocopia subió
durante dos días. Lo tapaba de casualidad una guarda que cortaba antes en los
aparatos vacíos.

Si el cambio toca corrientes, `postMessage`, IndexedDB, service worker, cámara,
Web Serial o cualquier cosa del navegador: **probalo en un navegador**, con la
app levantada y el gesto completo, antes de decir que está listo. Y cuando
algo se cuelga sin error, no lo deduzcas: poné huellas y mirá dónde se detiene.

### Datos de prueba

`npm run seed:prueba` → usuario `prueba@iman.local` / `prueba1234`, PIN de dueño
`1234`, catálogo de ejemplo cargado. **La base del servidor de desarrollo
(PGLite) es en memoria y se borra al reiniciar**, hay que re-seedear. El POS
del navegador vive en IndexedDB (`iman-local`) y no se borra con el restart.

---

## Stack

- React 19 + TanStack Start (file routes) + Tailwind v4 + Zustand
- Auth: Better Auth (email + contraseña)
- DB: PGLite en preview | Neon Postgres en producción
- Local: IndexedDB `iman-local`, claves kv `snap:{storeId}` `q:{storeId}` `session`
- PWA: `/manifest.webmanifest` + `/sw.js`
- Moneda: ARS es-AR vía `src/lib/format.ts`
- Hostinger = landing + WooCommerce (venta de licencias). **No corre el código de
  la app.** Las escrituras del POS van a Neon.
- Producción: **https://iman2-ochre.vercel.app** (Vercel, cada push a `main`).
  Las otras direcciones `*.vercel.app` del proyecto (las de cada despliegue)
  están detrás del login de Vercel: para mirar producción desde afuera, usar
  esta.

---

## INVARIANTES — no romper

1. **El encargado vende y hace CAJA sin PIN.** Nunca le pidas PIN para vender.
2. **El overlay de Dueño y la pestaña Dueño del celu piden PIN de dueño**
   (4–8 dígitos, SHA-256 de `iman.dueno.v1:{pin}`, desbloqueo por 20 min).
3. **Cada local tiene una sola caja, y la decide el servidor.** La caja puede
   ser la PC, una tablet o un celu: es un **rol** del aparato, no el tamaño de
   pantalla (`rol.ts`). El ancho decide la disposición; el rol, los permisos.
   Pasar la caja pide red y PIN del dueño, y el turno cerrado (o la toma
   forzada, si la caja de antes se rompió). Los demás aparatos son **de
   piso**: arman el ticket y lo mandan a la caja con el medio de pago. **Un
   aparato de piso nunca cobra, ni abre turno, ni muestra "Confirmar venta",
   "Cuánto pagó" o el vuelto.** Sin voz en el celu, sea caja o piso. Un local
   **sin caja anotada** se comporta como antes: cobra la pantalla de PC.
4. **La caja cobra y lleva el turno.** En PC: Mostrador, Inventario, Pedidos,
   Caja, Dueño (logo). En un celu que es la caja: Vender (con cobro) · Caja ·
   Stock · Más (Llegó, Vence, Actualizar precios, Importar) · Dueño. El celu de
   piso: Vender · Stock · Llegó · Vence · Dueño. En un turno de otro aparato
   (toma forzada), la caja no cobra hasta cerrarlo contando la plata.
5. **Nunca pisar el local con un blob JSON completo en cada scan.** Sync =
   cinta de eventos append-only + snapshot al tocar Sincronizar. La fotocopia va
   con `rev`: si otro aparato subió algo, junta y reintenta una vez en lugar de
   pisar.
6. **No hacer backup constante de cada local.** Recuperación si Chrome borra
   datos = último Sincronizar exitoso. Soporte nunca arranca diciendo "borrá los
   datos del sitio".
7. **La ciudad es por local** (`settings.city`) y se imprime en el ticket.
   Rosario no puede imprimir CABA.
8. **Una cuenta, varios locales** (seats del plan). Mismo login para encargado y
   dueño.
9. **Packs:** se compra el bulto (`packBarcode` + `packQty`) y se vende por
   unidad (`barcode`). El stock siempre se guarda en unidades.
10. **La planilla del mes (Caja) cuadra EFECTIVO, no es un P&L.** Las ganancias
    viven en Dueño → Mes.
11. **Fechas:** `todayKey` es fecha LOCAL. Nunca `toISOString().slice(0,10)`.
12. **Los manuales son para vendedores de IMAN y soporte contratado**, en
    castellano, solo en Taller. No son para el encargado.
13. **El .exe con Tauri es para más adelante.** La instalación de la PWA es la
    app de PC.
14. **Hostinger = landing + Woo.** Las escrituras del POS van a Neon (o a un VPS
    chico).
15. **Frase de reclamo del vendedor:** `SOY EL VENDEDOR`
16. **Sin GO no se escribe código.** Ver "Cómo trabajamos" abajo.
17. **La clave del Estudio vive SOLO en la variable de entorno del servidor**
    `IMAN_ESTUDIO_PASSWORD`. Nunca en `src/`, nunca en git: `founder-public.ts`
    viaja al navegador.
18. **Toda modificación de la cola local pasa por `editQueue`**
    (`src/lib/local-db.ts`). Dos eventos en el mismo tick se pisaban y se perdía
    uno (devolución a proveedor, recibir pedido, borrado masivo).

---

## Compatibilidad de eventos

Los aparatos no se actualizan al mismo tiempo. Un celu puede llevarse semanas
en la versión anterior. La cinta es la misma: lo que manda la PC lo aplica el
celu con **el `applyEvent` que tiene**, no con el de ahora.

- **Nunca achicar el body de un evento que ya existe.** El aparato viejo lo
  aplica con el código viejo. Los campos que no viajan se borran (un
  `{ ...incoming }` se come nombre, código, rubro).
- **Si hace falta mandar menos, se crea un TIPO NUEVO.** El `applyEvent` viejo
  cae en el `default` y lo ignora limpio. El costo: ese aparato no se entera
  hasta que actualice. El beneficio: no se le destruye nada.
- **Ejemplos.** `lot` fue bien: tipo nuevo, el viejo lo ignora. Achicar
  `product` a `{ id, price }` fue mal: el tipo ya existía, el spread viejo
  casi le borra el catálogo a los aparatos sin actualizar. La plata va en
  `price`. La ficha (nombre, código, pack, rubro) va en `product` completa,
  sin stock ni lots.

Esto ya había pasado: estaba anotado como pendiente, con la condición de no
hacerlo hasta que todos los aparatos tuvieran la versión nueva, y se hizo
igual. Si no queda escrito, vuelve a pasar.

---

## Mapa de archivos

### Pantallas

| Archivo | Qué es |
|---|---|
| `src/components/app.tsx` | máquina de gates: hub / wizard / activate / desk / taller |
| `src/components/shell.tsx` | nav de PC y de celu, logo → Dueño, botón Sincronizar |
| `src/components/counter-view.tsx` | Mostrador (venta en PC) |
| `src/components/inventory-view.tsx` | Inventario |
| `src/components/orders-view.tsx` | Pedidos; llegada contra boleta |
| `src/components/cash-view.tsx` + `ledger-grid.tsx` | Caja / planilla del mes |
| `src/components/price-calc.tsx` | Actualizar precios (Caja PC) |
| `src/components/costo-boleta.tsx` | ejemplo de boleta A/X; se reusa en la llegada |
| `src/components/settings-view.tsx` | Ajustes: condición fiscal, filas de Asientos |
| `src/components/ledger-rows-config.tsx` | el dueño arma las filas y los tags |
| `src/components/phone-sell / phone-floor / phone-receive` | el celu (Llegó carga costo opcional) |
| `src/components/owner-desk.tsx` + `owner-pin-dialog.tsx` + `owner-prices.tsx` | Dueño. En el celu, Precios se mira |
| `src/components/camera-scan.tsx` | escaneo con cámara a pantalla completa (PC, Inventario, Stock) |
| `src/components/scan-strip.tsx` | la cámara como franja arriba del ticket, en Vender del celu |
| `src/components/vendor-dashboard.tsx` | Taller (vendedor) |

### Núcleo

| Archivo | Qué es |
|---|---|
| `src/lib/store.ts` | Zustand. `checkout`, `refundCliente`, `refundProveedor`, `saveProduct`, `adjustStock`, `setLedgerCell`, `receiveOrder`, `saveSettings`, `saveSupplier`, `importCatalog`, `applyCategoryPrices` — **todos llaman `recordEvent`** |
| `src/lib/events.ts` | `applyEvent`. Tipos: sale, stock, ledger, product, product.delete, refund, receive, order, staff, category, lot, supplier, settings, price, shift, drop, markup |
| `src/lib/local-db.ts` | IndexedDB, `recordEvent`, `pendingEvents`, `markAcked`, `editQueue` |
| `src/lib/event-queue.ts` | cola local pura (append/ack/trim/chunk) + tests |
| `src/lib/sync.ts` | `syncNow` (botón), `pushQuiet` (la cinta sube sola), `pullCopy` |
| `src/lib/kiosk.ts` | servidor: `pushEvents`, `pullEvents` |
| `src/lib/pack.ts` | `findByScan`: packBarcode → packQty unidades; barcode → 1 |
| `src/lib/rol.ts` | el rol del aparato (caja / piso / sin asignar) y `puedeCobrar`: el ancho decide la disposición, el rol los permisos |
| `src/lib/caja-local.ts` | lo que el aparato sabe de la caja (`iman-caja:{local}`), `useRol`, `useVigilarCaja` |
| `src/components/caja-del-local.tsx` | arriba de todo del panel del dueño (PC y celu): "La caja de este local:" en palabras y "Pasar la caja a este aparato" (con toma forzada) |
| `src/lib/tipo-aparato.ts` | qué tipo de aparato es la caja (celu, tablet, computadora) y cómo se le dice al dueño; lo guarda `kiosk_store.caja_tipo` al tomar la caja |
| `src/components/donde-cobras.tsx` | "¿Dónde vas a cobrar?" al entrar por primera vez a un local; "Solo tengo celular" deja la caja en ese celu si el local es nuevo |
| `src/lib/cobra-en.ts` | las opciones de "¿Dónde vas a cobrar?" y los avisos (`AVISO_CELU_*`) |
| `src/components/phone-mas.tsx` | la pestaña Más del celu que es la caja |
| `src/lib/escaneo.ts` | lecturas por presencia, ritmo de la cámara, recorte visible, lector en modo teclado |
| `src/lib/camara-lectora.ts` | el bucle de la cámara (BarcodeDetector) que usan las dos pantallas de escaneo |
| `src/lib/ledger.ts` | filas de Asientos por tags, archivo del mes con las filas de entonces |
| `src/lib/costo-guia.ts` | qué renglón de la boleta copiar, calculadora de bulto, sospechas |
| `src/lib/fiscal.ts` | condición fiscal del local, tasa y nombre del impuesto (datos, no constantes) |
| `src/lib/mes.ts` | `margenDelMes`: la resta del mes, con o sin el impuesto de góndola |
| `src/lib/receive-cost.ts` | recepción contra lo pedido + costo de la boleta |
| `src/lib/catalog-io.ts` | import/export. El stock de la planilla no pisa el del local |
| `src/lib/pricing.ts` | márgenes, `quotedPrice`, `invoiceForProduct` |
| `src/lib/print.ts` + `escpos.ts` + `usb-print.ts` | ticket ESC/POS por Web Serial |
| `src/lib/errors.ts` | traduce fallas técnicas a lenguaje de piso |
| `src/lib/key-lock.ts` | turno por clave para IndexedDB |

### Cinta — qué viaja en qué tipo

- **`price`:** plata (costo y/o góndola). Actualizar precios, alinear un rubro, el cruce del dueño. No da de alta ni revive.
- **`product`:** alta (con stock inicial) o edición de ficha (nombre, código, pack, rubro…). Update: ficha completa, sin stock ni lots.
- **`lot`:** un lote de vencimiento. Stock y lots no viajan en `product`.
- **`settings`:** redondeo, comisión MP, condición fiscal, filas de Asientos. PIN y logo solo si ese toque los cambió. **Ya no lleva márgenes.**
- **`markup`:** el margen de un rubro: `{ categoryId, fac: "X" | "A", value }` (`value: null` = sin margen propio). Dice qué cambió, no la lista entera: con la lista, un aparato atrasado pisaba los márgenes que otro había cambiado en otros rubros. Un aparato sin actualizar lo ignora (no se entera hasta actualizar). Si un aparato viejo todavía manda la lista entera en `settings`, el nuevo solo toma los rubros que no tiene (un rubro nuevo llega con su margen) y no pisa los que ya están.
- **`supplier`:** alta/edición/baja de proveedor (`op: save` o `delete`).
- **`shift`:** apertura y cierre de turno (`op: open` / `close`). El cierre manda el turno entero y la fila de la planilla de ese día. El turno cerrado lleva `closedBy` (el aparato que hizo el arqueo) y `heredado` si se cerró después de forzar la toma de la caja: el historial de Caja marca "Lo cerró otro aparato" (`cerradoPorOtro`).
- **`drop`:** retiro de caja a fuerte, con el `shiftId` del turno.
- **`sale`** lleva el `shiftId` del turno en que se cobró y el `deviceId` del aparato que cobró (lo usa el plegado del mes). Las ventas sin `shiftId` (de antes, o de un aparato sin actualizar) entran al arqueo por hora (`ventasDelTurno`, `src/lib/turno.ts`).
- Stock: solo `sale`, `stock`, `refund`, `receive`, `lot`.

`importCatalog` ya no es un `setState` masivo: emite `category`/`product` (o `price` si solo cambió la plata) uno por uno. Producto que ya existe: nombre, código, precio, costo, rubro. **El stock de la planilla se ignora.**

### Planilla y el mes

El dueño arma las filas (`ledgerRows` + `ledgerTags`). TOTAL PROVEEDORES suma lo tagueado `proveedor`, no ids fijos. Un mes archivado guarda **las filas de entonces** (`MonthSheet.rows`): septiembre viejo no se viste con las de ahora.

**Quién pliega el mes** (`src/lib/plegado.ts`): el aparato que abrió el último
turno (`CashShift.deviceId`). El resumen lleva una marca (`monthMark`) de hasta
dónde llega, por aparato que cobró. Todos sacan de la lista lo que la marca
cubre y no vuelven a sumar una venta cubierta que llega tarde. El que no pliega
**nunca descarta** una venta sin cubrir, ni pasando `SALES_KEEP`. El servidor
no es un aparato: nunca pliega. Al juntar dos copias, el resumen se queda
entero del lado con la marca más adelantada.

La planilla sigue cuadrando **efectivo** (invariante 10). Las ganancias viven en Dueño → Mes (`margenDelMes`):
- Monotributo y en negro: la plata que entró. Etiquetas distintas.
- Responsable inscripto + góndola con impuesto: las ventas se miran sin ese impuesto. Tasa y nombre salen del local (`taxPct`, `taxName`), no de un 21% fijo.

### Sync — cómo funciona

Cursor = `seq` del servidor (`migrations/0015_event_seq.sql`).
`pullEvents(afterSeq)` → `{ events, cursor, hasMore }`.
**El reloj del aparato no es cursor:** un celu sin red subía con hora vieja y la
PC no lo bajaba nunca.
Push en tandas de 200 (`event-queue.ts chunk`). Se marca como subido **solo** lo
que vuelve en `accepted`.

**La cinta sube sola** cuando hay red (`pushQuiet`, a cada cambio). **La
fotocopia no:** Sincronizar, cierre de turno, cerrar la app (invariante 6).
Sincronizar = push pendientes → pull por seq (hasta 20 páginas) → aplicar
eventos ajenos (`pulledPatch`, incluye `settings`) → `saveLocalSnapshot` →
fotocopia con `rev`. `pullCopy` usa el estado vivo, no una foto vieja, para no
pisar stock ni el ticket a medio armar.

El otro aparato **no aplica** lo ajeno hasta que alguien toca Sincronizar ahí.
Que la cinta haya subido no es lo mismo que el celu ya venda al precio nuevo.

---

## Copy y lenguaje

- Todo lo que ve el usuario va en **castellano rioplatense, corto, lenguaje de
  piso**.
- Prohibido en la UI: puertos, `localhost`, rutas de archivos, jerga de SaaS en
  inglés, nombres de funciones, stack traces crudos. Los errores pasan por
  `src/lib/errors.ts`.
- Al founder hablale en lenguaje de producto, no de ingeniería.

---

## NO REVIVIR

- pestaña "Hoy" de `reports-view`
- pedido sugerido
- conectores de `app-data`
- multiplayer P2P (`src/lib/multiplayer/`)
- arrancar desde `attachments/index.html` o cualquier cosa en PHP

---

## Falta hacer (no está construido)

Tauri .exe · carga probada de 10k · recuperación de PIN cuando quedás afuera ·
NC real en PDF · login separado para el encargado · PowerSync/CRDT · React
Native · backup automático de blob completo · impresora WebUSB clase 7 (hoy solo
serial)

### Pendientes

La lista oficial: lo que no está acá se pierde. Una línea por ítem; al
resolver uno, se saca de acá en el mismo commit.

**Decisiones de Andres (sin código hasta que decida)**
- Plan de licencias: cómo se cobra, la prueba gratis, y qué pasa cuando vence. Hoy la PC sigue vendiendo vencida por accidente (ver el NO TOCAR de abajo).
- Control de planes en el Estudio: plan por cuenta, unificar `extra_seats` (vive en dos tablas), baja por cuenta. Con la baja, borrar la cuenta `qa-sync@iman.local`.
- Supervisión de precios en el panel del dueño: definirla después de uso real.
- Umbrales de color del botón Sincronizar: ajustarlos con uso real.

**Producto**
- Sugerencias en Inventario mucho más completas, con creación e impresión de afiches y carteles de promos y ofertas.
- Revisar la lógica de vencimientos en celu y PC.
- Ventas por día de meses viejos: el gráfico de El mes arma los días viejos con los turnos cerrados (se guardan 90). Para meses más viejos haría falta guardar el total por día en el resumen plegado, que es tocar el plegado. Andres: todavía no.

**Técnico**
- La cinta de eventos (`kiosk_event`) crece sin techo en el servidor.
- Los lotes quedan distintos entre aparatos (`consumeFifo` corre en cada uno con su propio estado).
- Dos cambios cruzados al mismo ítem terminan al revés entre aparatos.
- Cambiar de local carga la fotocopia sin juntarla con la copia del aparato.
- Los editores guardan campos que el usuario no tocó (pisan cambios de otro aparato).
- La línea de borrados del registro de sincronización dura 2 días; soporte debería poder verla.
- Aviso de React en modo demo: el Shell escribe en el store mientras dibuja (`setDeskStoreId`).
- Tope de pull de 10.000 eventos (20 páginas): un aparato muy atrasado no baja todo de una.
- Los multiplicadores 2,12 / 1,85 tienen el IVA cocinado adentro: no sirven para otros países.
- **RIESGO:** las variables de Vercel en Preview apuntan a la base de producción: pushear una rama corre migraciones contra Neon.

**A probar en un celu real (no se puede desde la máquina de desarrollo)**
- El ícono en la pantalla de arranque (ya están los de 1024).
- El escáner: el alto de la franja, los 3 cuadros de ausencia, la velocidad de la cámara.
- El umbral de 40 ms entre teclas con un lector Bluetooth real.
- iPhone: la cámara con la biblioteca `barcode-detector`, en pausa hasta probarlo.

**Fuera del código**
- Comprar el dominio antes del primer kiosco.
- Las piezas de redes y el kit de marca para afiliados.
- El texto de "Qué necesitás" en la landing.

### Plan del celu como caja

Decisión de producto: IMAN tiene que servir en un local que solo tiene un
celular. Cada local tiene **una sola caja**, que puede ser la PC o un celu: es
un rol del aparato, no su tamaño de pantalla. Los demás aparatos son de piso.
Hasta que esto esté construido, las invariantes 3 y 4 siguen valiendo como
están escritas.

- **a. Cada venta lleva su turno** y el arqueo cuenta por turno. Hecho.
- **b. El rol de caja lo decide el servidor**, en lugar del ancho de
  pantalla. Hecho (rama `noche-celu-caja`): `rol.ts`, `caja-local.ts`,
  `tomarCaja`.
- **Mínimo de un kiosco solo celu.** Hecho con el c: cobrar, la caja (turno,
  retiros, cierre), la planilla de un día, Actualizar precios, importar el
  catálogo, y stock, alta, Llegó y Vence que ya estaban. Pestañas del celu que
  es la caja: Vender · Caja · Stock · Más · Dueño.
- **c. Cobro en el celu.** Hecho: "Confirmar venta", "Cuánto pagó" y el vuelto
  están **solo en el aparato que es la caja**. En un celu de piso siguen
  afuera, a propósito: "Confirmar venta" mostraba un cartel verde de venta sin
  registrar nada y el encargado cobraba en efectivo sin registro; el vuelto se
  calcula donde está la plata. **Un celu de piso nunca los muestra.**
- **d. Pase de caja** de un aparato a otro. Hecho: pide el turno cerrado, o
  la toma forzada con el turno heredado.

"¿Dónde vas a cobrar?" (`donde-cobras.tsx`, `cobra-en.ts`): la respuesta de
cada local queda en `kiosk_store.cobra_en` y el Estudio la cuenta. **Si cambia
lo que el celu puede hacer, actualizar los `AVISO_CELU_*` de `cobra-en.ts` y
avisarle a Andres para que cambie la landing.**

El iPhone queda en pausa hasta poder probarlo en uno real.

**El b va antes que el c, sin excepción.** El mes lo pliega el aparato
que abrió el último turno (`plegado.ts`). Hoy solo la PC abre turnos, así que
solo ella pliega y el caso de dos aparatos plegando a la vez no existe. El día
que el celu pueda abrir turnos sin que el servidor decida quién es la caja, ese
caso aparece, y el resumen del mes puede quedar corto sin que nadie se entere.

### ⚠ NO TOCAR: qué hace hoy el vencimiento de licencia

**Hoy el vencimiento NO bloquea la PC del mostrador, y eso no lo eligió nadie.**

La condición está en `app.tsx:541`:

```js
const onFloor = gate === "desk" || Boolean(lock) || floor;
const licensed = license?.active || trial?.active || isVendor || onFloor;
```

Ese `lock` es el candado `iman-floor-lock` de `localStorage`, que se guarda al
entrar al Mostrador y solo se borra al Salir. Un aparato que ya estuvo en el
mostrador arranca derecho ahí, prende `onFloor`, y con eso `licensed`: **sigue
vendiendo después del vencimiento, indefinidamente**. Se bloquea solo el
aparato que cerró sesión, uno nuevo, o el que sale al hub.

Sin licencia la app entera se reemplaza por la pantalla de activación: **no hay
modo de solo lectura, es todo o nada.**

El candado existe para que la PC arranque rápido en el mostrador. Que además
sea lo que evita cortarle la caja a un kiosco es **un accidente**, no una
decisión, y no está escrito en ninguna invariante.

**No toques `iman-floor-lock` ni esa condición hasta que Andres defina qué hace
el vencimiento.** Un cambio ahí puede pasar, sin que nadie lo note, de "la caja
nunca se bloquea" a "la caja se bloquea en medio de una venta". Eso es lo peor
que le puede pasar a un local.

### Control de planes en el Estudio — en pausa

Pendiente hasta que se defina el plan. Lo que hay que resolver cuando se
retome:

- **Un plan por cuenta.** Hoy el plan vigente no está guardado: se deduce
  buscando la licencia canjeada con el `expires_at` más lejano. Por eso no se
  puede operar una cuenta a mano sin generar un código y dictárselo al
  kiosquero para que lo canjee.
- **`extra_seats` vive en dos tablas**, `iman_owners` y `kiosk_account`.
  `grantExtraLocal` escribe en las dos y `extraSeatsOf` lee una y cae a la
  otra. Dos fuentes para el mismo número.
- **Falta una baja por cuenta en el CRM del Estudio.** Hoy hay reset de
  contraseña y de PIN, y nada más. Era lo que tapaba `purgeForgottenAccounts`,
  que se sacó porque borraba todas las cuentas menos una.

Ya no es deuda (no reabrir): cinta de `settings` y `supplier`, evento `price`,
ficha completa en `product`, filas de Asientos por tags, meses archivados con
sus filas, condición fiscal y `margenDelMes`, `importCatalog` por eventos,
guía de costo en Actualizar precios, `pullCopy` que no pisa el estado vivo.

### Archivado: que el servidor mantenga la fotocopia

La idea era que el servidor aplicara los eventos sobre su propia fotocopia, así
ningún aparato tendría que subirla entera ~15 veces por día. **No va**, y estos
son los números por los que no va:

- **Aplicar evento por evento sale más caro, no más barato.** Postgres no
  actualiza un pedazo de un jsonb: `jsonb_set` reescribe el valor entero y toda
  su cadena TOAST. Hoy son 15 reescrituras de 1,19 MB por día y por local;
  evento por evento serían 225. Y desde que la fotocopia viaja gzip (58 KB) no
  queda tráfico para ahorrar: el problema económico ya está resuelto.
- **Materializar solo al bajar** — el servidor aplica la cinta cuando alguien
  pide la fotocopia, no en cada evento — baja las escrituras, pero no libera de
  subir: hay que resolver igual el plegado de meses y las claves que no tienen
  evento. Solo espacia las subidas.
- **Filas de verdad en vez de un blob** es la respuesta correcta a esa escala y
  es reescribir la persistencia entera. Hoy no hay evidencia de que haga falta.

**Cuándo se retoma:** cuando algo que no sea un aparato necesite el estado al
día del local — un tablero web donde el dueño mire sus locales con las PC
apagadas — o cuando la carga probada de 10k lo pida. Ahí la respuesta son filas,
no aplicar eventos sobre el blob.

**Qué no se toca al acercarse a esto:** `rev`, el juntar y reintentar, `mark` y
el arranque desde la foto; `mergePayload`, `mergeAggs`, `prunePayload` y el
plegado de meses (plegar dos veces cuenta el mes de más); la cinta, el cursor
por `seq` y las tandas de 200.

---

## Cómo trabajamos

El founder (Andres) manda correcciones desde el uso real del local. El ciclo:

1. **Sin `GO` explícito, no toques código.** Si el pedido es ambiguo, respondé
   con notas y preguntas primero. Si el mensaje ya viene como orden clara, eso
   es GO.
2. **Arreglá lo que se pidió y nada más.** No refactorices de paso, no
   "aproveches" para mejorar el sync, el auth o el store. Si ves algo roto al
   lado, anotalo al final de tu respuesta y seguí.
3. **Un commit por corrección o por tanda.** Nada de commits gigantes
   imposibles de revertir.
4. **Si una corrección choca con una invariante de arriba, pará y decilo.** No
   la implementes callado.
5. Cerrá con los cuatro checks y contá qué probaste a mano.
6. **Nunca levantar el servidor local contra la base de producción.** Cualquier
   prueba, script o arreglo que escriba datos corre contra la base de
   desarrollo. Si hace falta verificar algo contra Neon, se hace contra el
   deploy en Vercel, en incógnito, con una cuenta de prueba.
