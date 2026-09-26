/**
 * El arranque con candado no guarda ni sube nada que no sea el local.
 *
 * Al arrancar, el aparato pide a IndexedDB la copia del local. Mientras no
 * llega, el store tiene lo que traía de fábrica. Si algo guarda o sube en esa
 * ventana, guarda o sube eso en lugar del local.
 *
 * Es una carrera entre IndexedDB y los efectos de React: en Node no pasa. Por
 * eso corre en el navegador, con la app levantada, y para que la carrera salga
 * siempre igual demora 2,5 s la lectura de la copia (`snap:{local}`).
 *
 * Casos, cada uno con una recarga:
 *   1. hay una fotocopia pendiente de antes y el aparato arranca;
 *   2. la app se esconde en la ventana (pantalla bloqueada, otra app);
 *   3. en ningún cuadro se ve otro local que no sea el de verdad;
 *   4. el aparato tiene el candado pero no la copia: la baja del servidor;
 *   5. tampoco hay servidor: avisa "No pude abrir el local", no abre otra cosa,
 *      y Reintentar abre cuando vuelve, aunque vuelva lento (Neon despertando
 *      a primera hora): durante el Reintentar el servidor tarda SERVIDOR_LENTO_MS,
 *      más que el corte de 4 s que tiene el arranque con candado.
 *
 * Nada espera un tiempo fijo a que el servidor conteste: se espera a que se
 * vea el local, con tope. Una espera fija fallaba al azar con el servidor
 * recién levantado, y un test que falla a veces enseña a ignorarlo.
 *
 * Las subidas se atajan acá y no llegan al servidor.
 *
 *   npm run dev:local && npm run seed:prueba   (antes)
 *   npm run qa:arranque
 *
 * Sale con 1 si algo se filtró.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { chromium, devices } from "playwright";
import { motivoParaNoCorrer } from "./qa-base-local.mjs";

const BASE = process.env.IMAN_QA_URL || "http://127.0.0.1:8080";

// Sube de verdad: solo contra la base local de desarrollo (ver qa-base-local.mjs).
let envLocal = "";
try {
  envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
} catch {
  /* sin .env.local */
}
const motivo = motivoParaNoCorrer({ databaseUrl: process.env.DATABASE_URL, envLocal, baseUrl: BASE });
if (motivo) {
  console.error(`No corro: ${motivo}`);
  process.exit(1);
}
const CUENTA = { email: "prueba@iman.local", clave: "prueba1234", local: "Kiosco de Prueba" };
const DEMORA_MS = 2500;
const SERVIDOR_LENTO_MS = 6000;
const TOPE_MS = 30_000;

/** Corre en la página antes que la app. */
function ganchos(demora) {
  const t0 = performance.now();
  window.__esconder = localStorage.getItem("qa-esconder") === "1";
  if (localStorage.getItem("qa-demora") !== "1") window.__sinDemora = true;
  // Demora las lecturas de la copia del local durante el arranque.
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (key) {
    const req = get.call(this, key);
    if (typeof key !== "string" || !key.startsWith("snap:") || window.__sinDemora) return req;
    if (performance.now() - t0 > 20_000) return req;
    let handler = null;
    Object.defineProperty(req, "onsuccess", {
      configurable: true,
      get: () => handler,
      set: (fn) => {
        handler = fn;
      },
    });
    req.addEventListener("success", (e) => {
      window.setTimeout(() => handler?.call(req, e), demora);
    });
    if (!window.__primeraDemora) {
      window.__primeraDemora = performance.now();
      if (window.__esconder) {
        // En plena ventana: la app se va a segundo plano.
        window.setTimeout(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new Event("pagehide"));
          window.setTimeout(() => {
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
          }, 50);
        }, 300);
      }
    }
    return req;
  };

  // Qué nombre de local se pintó en cada cuadro.
  window.__nombres = [];
  const mirar = () => {
    const h = document.querySelector("header");
    const txt = h?.textContent ?? "";
    if (txt && !window.__nombres.includes(txt)) window.__nombres.push(txt);
    requestAnimationFrame(mirar);
  };
  requestAnimationFrame(mirar);
}

/** Lee IndexedDB sin la demora. */
async function leer(page, key) {
  return page.evaluate(async (k) => {
    window.__sinDemora = true;
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("iman-local", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return new Promise((res) => {
      const r = db.transaction("kv", "readonly").objectStore("kv").get(k);
      r.onsuccess = () => res(r.result ?? null);
      r.onerror = () => res(null);
    });
  }, key);
}

async function escribir(page, key, value) {
  await page.evaluate(
    async ([k, v]) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open("iman-local", 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(v, k);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
    [key, value],
  );
}

async function borrar(page, key) {
  await page.evaluate(async (k) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("iman-local", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete(k);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  }, key);
}

/** Nombre del local que viaja en cada subida de la fotocopia. */
function nombreSubido(body) {
  // El cuerpo viaja serializado por TanStack: el gzip es un string "H4sI…".
  const m = /"(H4sI[A-Za-z0-9+/=]+)"/.exec(body ?? "");
  if (m) {
    try {
      const json = JSON.parse(gunzipSync(Buffer.from(m[1], "base64")).toString("utf8"));
      return json?.settings?.name ?? "(sin nombre)";
    } catch {
      return "(no se pudo leer)";
    }
  }
  const plano = /"settings"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]*)"/.exec(body ?? "");
  return plano ? plano[1] : null;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 5"] });
const subidas = [];
let sinServidor = false;
let servidorLento = false;
await ctx.route("**/_serverFn/**", async (route) => {
  if (sinServidor) {
    await route.abort();
    return;
  }
  if (servidorLento) await new Promise((r) => setTimeout(r, SERVIDOR_LENTO_MS));
  const body = route.request().postData() ?? "";
  if (/"gzip"/.test(body)) {
    const nombre = nombreSubido(body);
    if (nombre !== null) {
      subidas.push({ caso: ctx.__caso, nombre });
      await route.abort();
      return;
    }
  }
  await route.continue();
});

const page = await ctx.newPage();
const fallas = [];

/** Espera a que se pinte el local, con tope: no depende de cuánto tarde el servidor. */
async function esperarLocal(tope = TOPE_MS) {
  const desde = Date.now();
  while (Date.now() - desde < tope) {
    const nombres = await page.evaluate(() => window.__nombres ?? []).catch(() => []);
    if (nombres.some((n) => n.includes(CUENTA.local))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** La copia del local en IndexedDB, cuando llega (se guarda después de abrir). */
async function esperarCopia(key, tope = 10_000) {
  const desde = Date.now();
  let copia = null;
  while (Date.now() - desde < tope) {
    copia = await leer(page, key);
    if (copia?.settings?.name === CUENTA.local) return copia;
    await page.waitForTimeout(250);
  }
  return copia;
}

try {
  // Entrar y abrir el local una vez: deja el candado, la copia y el rev.
  await page.goto(`${BASE}/login`);
  await page.locator("#login-email").waitFor({ timeout: 30_000 });
  for (let i = 0; i < 60 && !(await page.locator("button[type=submit]").isEnabled()); i++) await page.waitForTimeout(500);
  await page.locator("#login-email").fill(CUENTA.email);
  await page.locator("#login-password").fill(CUENTA.clave);
  await page.locator("button[type=submit]").click();
  await page.waitForTimeout(4000);
  const seguir = page.getByRole("button", { name: /Así está, seguir/i }).first();
  if (await seguir.count()) {
    await seguir.click();
    await page.waitForTimeout(3000);
  }
  for (let i = 0; i < 60; i++) {
    if (await page.getByText(CUENTA.local).first().isVisible().catch(() => false)) {
      if (await page.locator("nav.fixed").isVisible().catch(() => false)) break;
    }
    const abrir = page.getByRole("button").filter({ hasText: "Abrir" }).first();
    if (await abrir.isVisible().catch(() => false)) await abrir.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  const lock = await page.evaluate(() => JSON.parse(localStorage.getItem("iman-floor-lock") || "null"));
  if (!lock) throw new Error("no quedó el candado: ¿corriste seed:prueba?");
  const snapKey = `snap:${lock.storeId}`;
  const real = await leer(page, snapKey);
  if (real?.settings?.name !== CUENTA.local) throw new Error(`la copia del aparato no es ${CUENTA.local}: es "${real?.settings?.name}" con ${real?.products?.length} productos`);

  await page.addInitScript(ganchos, DEMORA_MS);

  // 1. Fotocopia pendiente.
  ctx.__caso = "pendiente";
  await page.evaluate(() => localStorage.setItem("qa-demora", "1"));
  await escribir(page, `copy:${lock.storeId}`, { storeId: lock.storeId, payload: real, at: new Date().toISOString() });
  await page.reload();
  await page.waitForTimeout(DEMORA_MS + 5000);
  const nombres1 = await page.evaluate(() => window.__nombres);

  // 2. Esconder la app en la ventana.
  ctx.__caso = "esconder";
  await page.evaluate(() => localStorage.setItem("qa-esconder", "1"));
  await page.reload();
  await page.waitForTimeout(DEMORA_MS + 5000);
  const nombres2 = await page.evaluate(() => window.__nombres);
  const despues = await leer(page, snapKey);

  for (const s of subidas) {
    if (s.nombre !== CUENTA.local) fallas.push(`[${s.caso}] subió una fotocopia de "${s.nombre}"`);
  }
  if (despues?.settings?.name !== CUENTA.local) {
    fallas.push(`[esconder] la copia del aparato quedó como "${despues?.settings?.name ?? "(nada)"}"`);
  }
  // 3. Ningún cuadro con otro local.
  for (const [caso, nombres] of [["pendiente", nombres1], ["esconder", nombres2]]) {
    for (const n of nombres) {
      if (!n.includes(CUENTA.local)) fallas.push(`[${caso}] se pintó un encabezado que no es el local: "${n.slice(0, 60)}"`);
    }
  }

  await page.evaluate(() => {
    localStorage.removeItem("qa-esconder");
    localStorage.removeItem("qa-demora");
  });
  await borrar(page, `copy:${lock.storeId}`);

  // 4. Candado sin copia: la baja del servidor.
  ctx.__caso = "sin-copia";
  await borrar(page, snapKey);
  await page.reload();
  if (!(await esperarLocal())) fallas.push("[sin-copia] no abrió el local desde el servidor");
  const nombres4 = await page.evaluate(() => window.__nombres);
  const bajada = await esperarCopia(snapKey);
  for (const n of nombres4) {
    if (!n.includes(CUENTA.local)) fallas.push(`[sin-copia] se pintó un encabezado que no es el local: "${n.slice(0, 60)}"`);
  }
  if (bajada?.settings?.name !== CUENTA.local) fallas.push("[sin-copia] no guardó la copia bajada del servidor");

  // 5. Candado sin copia y sin servidor: avisa, no abre.
  ctx.__caso = "sin-nada";
  await borrar(page, snapKey);
  sinServidor = true;
  await page.reload();
  await page.getByText("No pude abrir el local. Probá de nuevo.").waitFor({ timeout: 20_000 }).catch(() => {
    fallas.push('[sin-nada] no apareció "No pude abrir el local. Probá de nuevo."');
  });
  const nombres5 = await page.evaluate(() => window.__nombres);
  if (nombres5.length) fallas.push(`[sin-nada] abrió un local igual: "${nombres5[0].slice(0, 60)}"`);
  // Vuelve el servidor, pero lento: el Reintentar de primera hora.
  sinServidor = false;
  servidorLento = true;
  await page.getByRole("button", { name: "Reintentar" }).click().catch(() => {});
  if (!(await esperarLocal())) fallas.push("[sin-nada] Reintentar no abrió el local con el servidor lento");
  servidorLento = false;

  console.log(`subidas atajadas: ${subidas.length ? subidas.map((s) => `${s.caso}:"${s.nombre}"`).join(", ") : "ninguna"}`);
} catch (err) {
  fallas.push(`la prueba no pudo correr: ${err.message}`);
} finally {
  await browser.close();
}

if (fallas.length) {
  console.log("FALLA");
  for (const f of fallas) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("OK: el arranque no guardó ni subió nada que no sea el local");
