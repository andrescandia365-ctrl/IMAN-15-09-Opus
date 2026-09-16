import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "screenshots");
mkdirSync(shots, { recursive: true });

const BASE = process.env.IMAN_QA_URL || "http://127.0.0.1:8080/";

function snap() {
  const now = new Date().toISOString();
  return {
    products: [
      {
        id: "p6",
        name: "Coca-Cola 2.25 L",
        barcode: "77920001",
        price: 3200,
        cost: 2240,
        stock: 18,
        stockMin: 6,
        categoryId: "beb",
        active: true,
        expiresAt: null,
        priceUpdatedAt: now,
      },
    ],
    categories: [{ id: "beb", name: "Bebidas", sort: 2 }],
    sales: [],
    settings: {
      name: "Kiosco El Faro",
      rubro: "kiosco",
      city: "Rosario",
      onboarded: true,
      ownerPinHash: "",
      printerBaud: 9600,
      voiceEnabled: false,
      voiceLang: "es-AR",
      voiceGender: "female",
      voiceRate: 1,
      theme: "dark",
      blockZeroStock: false,
      stockAlertsEnabled: true,
      cashFloat: 15000,
      cashThreshold: 40000,
      phrases: ["Gracias"],
      shifts: [
        { key: "manana", name: "Mañana", start: 6 },
        { key: "tarde", name: "Tarde", start: 14 },
        { key: "noche", name: "Noche", start: 22 },
      ],
      tasks: { manana: [], tarde: [], noche: [] },
    },
    suppliers: [],
    shifts: [
      {
        id: "sh_floor",
        status: "open",
        openingCash: 15000,
        closingCash: null,
        expectedCash: null,
        salesTotal: null,
        salesCount: null,
        note: null,
        openedAt: now,
        closedAt: null,
      },
    ],
    drops: [],
    orders: [],
    movements: [],
    refunds: [],
    books: [],
    monthAggs: [],
    monthSheets: [],
    staff: [],
    roster: [],
    payouts: [],
    ticket: [],
    payMethod: "efectivo",
  };
}

function session() {
  return {
    access: {
      isVendor: false,
      vendorClaimed: false,
      sellerName: "IMAN",
      salesUrl: "",
      hasShopSecret: false,
      trial: null,
      license: {
        code: "LOCAL",
        months: 12,
        seats: 8,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        active: true,
      },
    },
    stores: [{ id: "s1", name: "Kiosco El Faro", alias: "", updatedAt: new Date().toISOString() }],
    activeStoreId: "s1",
  };
}

async function seedFloor(page) {
  const payload = snap();
  const sess = session();
  await page.evaluate(
    async ({ payload, sess }) => {
      const lock = {
        v: 1,
        userId: "u1",
        displayName: "Ana",
        email: "ana@local",
        storeId: "s1",
        lockedAt: new Date().toISOString(),
      };
      localStorage.setItem("iman-floor-lock", JSON.stringify(lock));
      localStorage.setItem("iman-last-store", "s1");
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("iman-local", 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(payload, "snap:s1");
          tx.objectStore("kv").put(sess, "session");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { payload, sess },
  );
}

async function waitSw(page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("no sw");
    const urls = [
      "/",
      "/manifest.webmanifest",
      "/favicon.svg",
      "/icon-192.png",
      "/icon-512.png",
      location.href,
      ...[...document.querySelectorAll("script[src], link[href]")].map((el) => el.src || el.href),
      ...performance.getEntriesByType("resource").map((e) => e.name),
    ];
    const cache = await caches.open("iman-shell-v2");
    await Promise.all(
      urls.map(async (href) => {
        try {
          const res = await fetch(href, { credentials: "same-origin" });
          if (res.ok) await cache.put(href, res);
        } catch {
          /* skip */
        }
      }),
    );
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    const worker = reg.active || navigator.serviceWorker.controller;
    if (worker) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 8000);
        navigator.serviceWorker.addEventListener("message", function onMsg(e) {
          if (e.data?.type !== "PRECACHE_DONE") return;
          navigator.serviceWorker.removeEventListener("message", onMsg);
          clearTimeout(t);
          resolve();
        });
        worker.postMessage({ type: "PRECACHE", urls });
      });
    }
  });
}

const browser = await chromium.launch({ args: ["--disable-web-security=false"] });
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const landing = await page.locator("body").innerText();
  await page.screenshot({ path: join(shots, "app-builder-preview.png"), fullPage: true });
  if (!/IMAN/.test(landing)) throw new Error(`landing missing IMAN: ${landing.slice(0, 200)}`);

  await seedFloor(page);
  await waitSw(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(/Mostrador|Vender|Coca-Cola/).first().waitFor({ timeout: 12_000 }).catch(() => null);
  await page.screenshot({ path: join(shots, "offline-online-desk.png") });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(/Mostrador|Vender|Coca-Cola/).first().waitFor({ timeout: 12_000 }).catch(() => null);
  const offlineText = await page.locator("body").innerText();
  await page.screenshot({ path: join(shots, "offline-desk-pc.png") });
  if (/No tienes conexión|No internet|ERR_INTERNET_DISCONNECTED/i.test(offlineText)) {
    throw new Error(`Chrome won offline: ${offlineText.slice(0, 240)}`);
  }
  if (!/Mostrador|Vender|Coca-Cola|Kiosco El Faro/.test(offlineText)) {
    throw new Error(`offline did not open till: ${offlineText.slice(0, 400)}`);
  }

  const search = page.getByPlaceholder(/Nombre o código/);
  await search.click();
  await search.fill("77920001");
  await page.keyboard.press("Enter");
  await page.getByText("Coca-Cola 2.25 L").first().waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /Confirmar venta/i }).click({ timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, "offline-sold-pc.png") });

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mobile.newPage();
  await mpage.goto(BASE, { waitUntil: "domcontentloaded" });
  await seedFloor(mpage);
  await waitSw(mpage);
  await mpage.reload({ waitUntil: "domcontentloaded" });
  await mpage.getByText(/Vender|Coca-Cola|Mostrador|Kiosco El Faro/).first().waitFor({ timeout: 12_000 }).catch(() => null);
  await mobile.setOffline(true);
  await mpage.reload({ waitUntil: "domcontentloaded" });
  await mpage.getByText(/Vender|Coca-Cola|Mostrador|Kiosco El Faro/).first().waitFor({ timeout: 12_000 }).catch(() => null);
  const mtext = await mpage.locator("body").innerText();
  await mpage.screenshot({ path: join(shots, "app-builder-preview-mobile.png") });
  await mpage.screenshot({ path: join(shots, "offline-desk-phone.png") });
  if (/No tienes conexión|No internet|ERR_INTERNET_DISCONNECTED/i.test(mtext)) {
    throw new Error(`Chrome won offline on phone: ${mtext.slice(0, 240)}`);
  }
  if (!/Vender|Coca-Cola|Mostrador|Kiosco El Faro/.test(mtext)) {
    throw new Error(`phone offline missing till: ${mtext.slice(0, 400)}`);
  }
  await mobile.close();
  await context.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        errors,
        offlineHasTill: /Mostrador|Vender|Coca-Cola/.test(offlineText),
        phoneHasTill: /Vender|Coca-Cola|IMAN/.test(mtext),
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err), errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
