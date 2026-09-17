# IMAN — contexto para Claude Code

POS + caja + stock + vencimientos para kioscos y almacenes argentinos.
Se vende como lector láser + licencia de 12 / 24 / 36 meses (1 / 2 / 3 seats).

**Slogan:** Números claros. Local que crece.

---

## LEER PRIMERO

**`AGENTS.md` NO aplica.** Ese archivo es el contrato del sandbox de Grok Build
(App Builder): habla de `/workspace`, `startup.sh`, preview en el puerto 8080,
skills en `.grok/`, herramientas `imagine_*` y de cuándo scaffoldear una app
nueva. Nada de eso corre acá. Ignoralo completo, junto con la carpeta `.grok/`.

**`IMAN_HANDOFF.txt`** sí es válido y es la fuente de verdad del producto. Su
advertencia de "no adjuntes .tsx" era para chats que rechazan archivos: acá
tenés el repo entero, leé los archivos directo.

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

### Datos de prueba

`npm run seed:prueba` → usuario `prueba@iman.local` / `prueba1234`, PIN de dueño
`1234`, catálogo de ejemplo cargado. **La base local es en memoria y se borra en
cada reinicio**, así que hay que re-seedear.

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

---

## INVARIANTES — no romper

1. **El encargado vende y hace CAJA sin PIN.** Nunca le pidas PIN para vender.
2. **El overlay de Dueño y la pestaña Dueño del celu piden PIN de dueño**
   (4–8 dígitos, SHA-256 de `iman.dueno.v1:{pin}`, desbloqueo por 20 min).
3. **El celu revisa el local, no es una segunda caja.** Tabs: Vender, Stock,
   Llegó, Vence, Dueño. **Sin caja, sin voz.** El celu marca Llegó y manda el
   ticket a la PC; nunca cobra.
4. **La PC es la caja:** Mostrador, Inventario, Pedidos, Caja, Dueño (logo).
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

## Mapa de archivos

### Pantallas

| Archivo | Qué es |
|---|---|
| `src/components/app.tsx` | máquina de gates: hub / wizard / activate / desk / taller |
| `src/components/shell.tsx` | nav de PC y de celu, logo → Dueño, botón Sincronizar |
| `src/components/counter-view.tsx` | Mostrador (venta en PC) |
| `src/components/inventory-view.tsx` | Inventario |
| `src/components/orders-view.tsx` | Pedidos |
| `src/components/cash-view.tsx` + `ledger-grid.tsx` | Caja / planilla del mes |
| `src/components/phone-sell / phone-floor / phone-receive` | el celu |
| `src/components/owner-desk.tsx` + `owner-pin-dialog.tsx` + `owner-prices.tsx` | Dueño |
| `src/components/camera-scan.tsx` | escaneo con cámara (BarcodeDetector) |
| `src/components/vendor-dashboard.tsx` | Taller (vendedor) |

### Núcleo

| Archivo | Qué es |
|---|---|
| `src/lib/store.ts` | Zustand. `checkout`, `refundCliente`, `refundProveedor`, `saveProduct`, `adjustStock`, `setLedgerCell`, `receiveOrder` — **todos llaman `recordEvent`** |
| `src/lib/events.ts` | `applyEvent`. Tipos: sale, stock, ledger, product, product.delete, refund, receive, order, staff |
| `src/lib/local-db.ts` | IndexedDB, `recordEvent`, `pendingEvents`, `markAcked`, `editQueue` |
| `src/lib/event-queue.ts` | cola local pura (append/ack/trim/chunk) + tests |
| `src/lib/sync.ts` | `syncNow` (botón) y `pushQuiet` (fondo) |
| `src/lib/kiosk.ts` | servidor: `pushEvents`, `pullEvents` |
| `src/lib/pack.ts` | `findByScan`: packBarcode → packQty unidades; barcode → 1 |
| `src/lib/ledger.ts` | `LEDGER_ROWS`, filas bloqueadas, cierre de mes |
| `src/lib/print.ts` + `escpos.ts` + `usb-print.ts` | ticket ESC/POS por Web Serial |
| `src/lib/errors.ts` | traduce fallas técnicas a lenguaje de piso |
| `src/lib/key-lock.ts` | turno por clave para IndexedDB |

### Sync — cómo funciona

Cursor = `seq` del servidor (`migrations/0015_event_seq.sql`).
`pullEvents(afterSeq)` → `{ events, cursor, hasMore }`.
**El reloj del aparato no es cursor:** un celu sin red subía con hora vieja y la
PC no lo bajaba nunca.
Push en tandas de 200 (`event-queue.ts chunk`). Se marca como subido **solo** lo
que vuelve en `accepted`.
Sincronizar = push pendientes → pull por seq (hasta 20 páginas) → aplicar
eventos ajenos → `saveLocalSnapshot` → fotocopia con `rev`.

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
