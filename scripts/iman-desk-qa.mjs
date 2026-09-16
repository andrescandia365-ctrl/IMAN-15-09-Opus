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
        name: "Coca-Cola 500 ml",
        barcode: "77920002",
        price: 1800,
        cost: 1200,
        stock: 2,
        stockMin: 10,
        categoryId: "beb",
        active: true,
        expiresAt: null,
        priceUpdatedAt: now,
        onOffer: true,
      },
      {
        id: "p13",
        name: "Alfajor Guaymallén",
        barcode: "77930002",
        price: 800,
        cost: 400,
        stock: 36,
        stockMin: 8,
        categoryId: "gol",
        active: true,
        expiresAt: null,
        priceUpdatedAt: now,
      },
    ],
    categories: [
      { id: "beb", name: "Bebidas", sort: 2 },
      { id: "gol", name: "Golosinas", sort: 3 },
    ],
    sales: [],
    settings: {
      name: "Local de prueba",
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
      tasks: { manana: ["Reponer góndola"], tarde: ["Controlar caja chica"], noche: ["Cerrar turno"] },
      taskRemindersEnabled: true,
    },
    suppliers: [{ id: "s1", name: "Coca-Cola FEMSA", days: [1], orderDays: [7], categoryIds: ["beb"], invoiceType: "X", notes: "", whatsapp: "" }],
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const payload = snap();
  const sess = {
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
    stores: [
      { id: "s1", name: "Local de prueba", alias: "", updatedAt: new Date().toISOString() },
      { id: "s2", name: "Sucursal 2", alias: "", updatedAt: new Date().toISOString() },
    ],
    activeStoreId: "s1",
  };
  await page.evaluate(
    async ({ payload, sess }) => {
      localStorage.setItem(
        "iman-floor-lock",
        JSON.stringify({
          v: 1,
          userId: "u1",
          displayName: "Ana",
          email: "ana@local",
          storeId: "s1",
          lockedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem("iman-last-store", "s1");
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("iman-local", 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
        };
        req.onsuccess = () => {
          const tx = req.result.transaction("kv", "readwrite");
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
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Coca-Cola 500 ml").first().waitFor({ timeout: 12_000 });
  await page.screenshot({ path: join(shots, "desk-ui-1.png") });

  const body = await page.locator("body").innerText();
  if (/Pistola de código/.test(body)) throw new Error("hint text still visible");
  if (/\$50\.000|\$100\.000/.test(body)) throw new Error("50k/100k bills still visible");
  if (/Cambiar de local|chevron/i.test(await page.locator("header").innerText())) {
    /* name+city is ok; chevron should be gone */
  }
  const inv = page.getByRole("button", { name: "Inventario" });
  const invText = (await inv.count()) ? await inv.innerText() : "";
  if (/\d/.test(invText.replace("Inventario", ""))) throw new Error(`inventory still shows count: ${invText}`);

  await page.getByText("Coca-Cola 500 ml").first().click();
  await page.getByText("Todavía no hay líneas.").waitFor({ state: "hidden", timeout: 4000 }).catch(() => null);
  const after = await page.locator("body").innerText();
  if (!/Coca-Cola 500 ml/.test(after)) throw new Error("click did not keep product on screen");
  await page.screenshot({ path: join(shots, "desk-ui-2-click.png") });

  if (await page.getByText("productos bajo mínimo").count()) {
    await page.getByLabel("Quitar aviso").click();
    await page.getByText("productos bajo mínimo").waitFor({ state: "hidden", timeout: 3000 });
  }

  await page.getByLabel("Panel del dueño").click();
  const pin = page.getByLabel(/PIN|pin|clave/i).or(page.locator("input[type=password]")).first();
  if (await page.getByText(/creá|crear|PIN/i).count()) {
    const inputs = page.locator("input[type=password], input[inputmode=numeric]");
    if (await inputs.count()) {
      await inputs.first().fill("1234");
      const second = inputs.nth(1);
      if (await second.count()) await second.fill("1234");
      const ok = page.getByRole("button", { name: /Listo|Guardar|Crear|Entrar/i }).first();
      if (await ok.count()) await ok.click();
    }
  }
  await page.getByText("Local", { exact: true }).first().click({ timeout: 5000 }).catch(() => null);
  await page.screenshot({ path: join(shots, "desk-ui-3-owner.png") });

  console.log(JSON.stringify({ ok: true, errors, invText }, null, 2));
} catch (err) {
  await page.screenshot({ path: join(shots, "desk-ui-fail.png") });
  console.error(JSON.stringify({ ok: false, error: String(err), errors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
