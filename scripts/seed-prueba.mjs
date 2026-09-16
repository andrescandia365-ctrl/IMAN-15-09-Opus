/**
 * Deja un local de pruebas listo para trabajar.
 *
 * La base de datos del entorno local vive en memoria: cada vez que se reinicia
 * el servidor se borra todo. Este script rehace la cuenta, el local, el
 * catálogo de ejemplo y la clave del dueño, así se arranca el día entrando
 * nomás. Se puede correr las veces que haga falta.
 *
 *   npm run dev:local     (en una terminal)
 *   npm run seed:prueba   (en otra)
 *
 * Son datos de juguete de esta máquina, no de un local real.
 */
import { chromium } from "playwright";

const BASE = process.env.IMAN_QA_URL || "http://127.0.0.1:8080";
const CUENTA = {
  nombre: "Dueño de Prueba",
  telefono: "341 555-1234",
  email: "prueba@iman.local",
  clave: "prueba1234",
  pin: "1234",
  local: "Kiosco de Prueba",
  ciudad: "Rosario",
};

async function servidorArriba() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await servidorArriba())) {
  console.error(`[seed] No hay nadie sirviendo en ${BASE}. Arrancá con: npm run dev:local`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const hecho = [];

/** El botón se habilita recién cuando el navegador terminó de arrancar la app. */
async function esperarFormulario() {
  const boton = page.locator("button[type=submit]");
  await boton.waitFor({ timeout: 30_000 });
  for (let i = 0; i < 60; i += 1) {
    if (await boton.isEnabled()) return;
    await page.waitForTimeout(500);
  }
  throw new Error("el formulario nunca se habilitó");
}

async function cuerpo() {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\n+/g, " · ");
}

try {
  // 1. Cuenta: se intenta crear y, si ya existe, se entra.
  await page.goto(`${BASE}/login?alta=true`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").waitFor({ timeout: 30_000 });
  await esperarFormulario();

  if (await page.locator("#login-name").count()) await page.locator("#login-name").fill(CUENTA.nombre);
  if (await page.locator("#login-phone").count()) await page.locator("#login-phone").fill(CUENTA.telefono);
  await page.locator("#login-email").fill(CUENTA.email);
  await page.locator("#login-password").fill(CUENTA.clave);
  await page.locator("button[type=submit]").click();
  await page.waitForTimeout(3000);

  if (/ya tiene cuenta/i.test(await cuerpo())) {
    const yaTengo = page.getByRole("button", { name: /Ya tengo cuenta/i }).first();
    if (await yaTengo.count()) await yaTengo.click();
    await page.waitForTimeout(500);
    await page.locator("#login-email").fill(CUENTA.email);
    await page.locator("#login-password").fill(CUENTA.clave);
    await page.locator("button[type=submit]").click();
    await page.waitForTimeout(4000);
    hecho.push("entró con la cuenta que ya estaba");
  } else {
    hecho.push("creó la cuenta");
  }

  // 2. Pantalla de confirmación del mail.
  const seguir = page.getByRole("button", { name: /Así está, seguir/i }).first();
  if (await seguir.count()) {
    await seguir.click();
    await page.waitForTimeout(3000);
  }

  // 3. Según la cuenta, después de entrar puede aparecer el asistente, la lista
  //    de locales o el mostrador directo. Se resuelve cualquiera de las tres.
  for (let intento = 0; intento < 20; intento += 1) {
    if (await page.getByText(/Mostrador|Vender/).first().isVisible().catch(() => false)) break;

    const campoLocal = page.locator("#loc-name-0");
    if (await campoLocal.count()) {
      await campoLocal.fill(CUENTA.local);
      await page.locator("#loc-city-0").fill(CUENTA.ciudad);
      await page.locator("form").getByRole("button").last().click();
      hecho.push("registró el local");
      await page.waitForTimeout(5000);
      continue;
    }

    const abrir = page.getByRole("button").filter({ hasText: "Abrir" }).first();
    if (await abrir.count()) {
      await abrir.click();
      hecho.push("abrió el local");
      await page.waitForTimeout(5000);
      continue;
    }

    await page.waitForTimeout(1500);
  }
  await page.getByText(/Mostrador|Vender/).first().waitFor({ timeout: 30_000 });

  // 4. Clave del dueño.
  await page.getByLabel("Panel del dueño").click();
  await page.waitForTimeout(1500);
  const claves = page.locator("input[type=password], input[inputmode=numeric]");
  if (await claves.count()) {
    const n = await claves.count();
    for (let i = 0; i < n; i += 1) await claves.nth(i).fill(CUENTA.pin);
    await page.getByRole("button", { name: /Guardar clave|Entrar|Listo/i }).first().click();
    await page.waitForTimeout(2500);
    hecho.push(n > 1 ? "creó la clave del dueño" : "entró con la clave del dueño");
  }

  // 5. Nombre, ciudad y catálogo de ejemplo.
  await page.getByRole("button", { name: /^Local$/ }).first().click();
  await page.locator("#kiosk-name").waitFor({ timeout: 20_000 });
  await page.locator("#kiosk-name").fill(CUENTA.local);
  await page.locator("#kiosk-name").locator("xpath=following-sibling::button").first().click();
  await page.waitForTimeout(1200);
  await page.locator("#kiosk-city").fill(CUENTA.ciudad);
  await page.locator("#kiosk-city").locator("xpath=following-sibling::button").first().click();
  await page.waitForTimeout(1200);

  const cargar = page.getByRole("button", { name: /Cargar catálogo de ejemplo/i }).first();
  await cargar.scrollIntoViewIfNeeded();
  await cargar.click();
  await page.waitForTimeout(2500);
  hecho.push("cargó el catálogo de ejemplo");

  await page.getByRole("button", { name: /Volver al mostrador/i }).first().click();
  await page.waitForTimeout(3000);

  const texto = await cuerpo();
  if (/Todavía no hay productos/.test(texto)) throw new Error("el mostrador quedó sin productos");

  console.log("");
  console.log("  Local de pruebas listo:");
  for (const paso of hecho) console.log(`   · ${paso}`);
  console.log("");
  console.log(`   ${BASE}`);
  console.log(`   mail:  ${CUENTA.email}`);
  console.log(`   clave: ${CUENTA.clave}`);
  console.log(`   clave del dueño: ${CUENTA.pin}`);
  console.log("");
} catch (err) {
  await page.screenshot({ path: "screenshots/seed-prueba-fail.png" }).catch(() => null);
  console.error(`[seed] No se pudo dejar el local listo: ${err instanceof Error ? err.message : err}`);
  console.error(`[seed] Quedó una foto en screenshots/seed-prueba-fail.png`);
  console.error(`[seed] En pantalla: ${(await cuerpo()).slice(0, 200)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
