import { MAX_LOCALES } from "@/lib/plan";
import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_SETTINGS, SEED_SUPPLIERS } from "@/lib/seed";
import type { KioskPayload } from "@/lib/types";

export const MAX_STORES = MAX_LOCALES;

export function blankKiosk(name: string, catalog: "example" | "empty", city = ""): KioskPayload {
  const settings = {
    ...SEED_SETTINGS,
    name: name.trim() || "Local",
    city: city.trim(),
    onboarded: true,
    phrases: [...SEED_SETTINGS.phrases],
    shifts: SEED_SETTINGS.shifts.map((s) => ({ ...s })),
    tasks: { ...SEED_SETTINGS.tasks },
  };
  const opening = settings.cashFloat;
  const shift = {
    id: `sh_${Date.now()}`,
    status: "open" as const,
    openingCash: opening,
    closingCash: null,
    expectedCash: null,
    salesTotal: null,
    salesCount: null,
    note: null,
    openedAt: new Date().toISOString(),
    closedAt: null,
  };
  return {
    products: catalog === "example" ? SEED_PRODUCTS.map((p) => ({ ...p })) : [],
    categories: catalog === "example" ? SEED_CATEGORIES.map((c) => ({ ...c })) : [],
    sales: [],
    settings,
    suppliers: catalog === "example" ? SEED_SUPPLIERS.map((s) => ({ ...s, days: [...s.days] })) : [],
    shifts: [shift],
    drops: [],
    orders: [],
    movements: [],
    refunds: [],
    books: [],
    monthAggs: [],
    staff: [],
    roster: [],
    payouts: [],
    promos: [],
    ticket: [],
    payMethod: "efectivo",
  };
}
