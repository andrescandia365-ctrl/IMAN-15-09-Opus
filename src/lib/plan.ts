export const PLAN_MONTHS = [12, 24, 36] as const;
export type PlanMonths = (typeof PLAN_MONTHS)[number];

/** Hard ceiling per owner. Any plan year can be sold with 1–5 locales. */
export const MAX_LOCALES = 5;
export const PLAN_SEATS = [1, 2, 3, 4, 5] as const;
export type PlanSeats = (typeof PLAN_SEATS)[number];
/** Floor trial length. Day 20 asks for a plan code. */
export const TRIAL_DAYS = 19;

export const PLAN_LABEL: Record<PlanMonths, string> = {
  12: "12 meses",
  24: "2 años",
  36: "3 años",
};

export const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isPlanMonths(n: number): n is PlanMonths {
  return n === 12 || n === 24 || n === 36;
}

export function clampSeats(n: number): PlanSeats {
  const v = Math.round(Number(n) || 1);
  if (v <= 1) return 1;
  if (v >= MAX_LOCALES) return MAX_LOCALES;
  return v as PlanSeats;
}

export function isPlanSeats(n: number): n is PlanSeats {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5;
}

/** Years do not imply locales. If a code has no seats, it opens 1 local. */
export function seatsFromMonths(_months: number): number {
  return 1;
}

/** Optional SKU override: iman-12-3l, 3loc, locales-2 */
export function seatsFromSku(sku: string): number | null {
  const s = sku.toLowerCase().trim();
  const named = s.match(/(?:locales?|loc|l)[-_]?(\d{1,2})(?:\b|$)/);
  if (named) {
    const n = Number(named[1]);
    if (n >= 1 && n <= MAX_LOCALES) return n;
  }
  const tail = s.match(/[-_](\d{1,2})l(?:oc)?(?:\b|$)/);
  if (tail) {
    const n = Number(tail[1]);
    if (n >= 1 && n <= MAX_LOCALES) return n;
  }
  return null;
}

export function seatsForPlan(_months: number, sku = ""): number {
  return clampSeats(seatsFromSku(sku) ?? 1);
}

export function monthsFromSku(sku: string): PlanMonths | null {
  const s = sku.toLowerCase().trim();
  if (/(^|[^a-z0-9])iman-?36([^0-9]|$)/.test(s)) return 36;
  if (/(^|[^a-z0-9])iman-?24([^0-9]|$)/.test(s)) return 24;
  if (/(^|[^a-z0-9])iman-?12([^0-9]|$)/.test(s)) return 12;
  if (/\b3\s*a[nñ]os\b/.test(s)) return 36;
  if (/\b2\s*a[nñ]os\b/.test(s)) return 24;
  if (/\b12\s*meses\b/.test(s)) return 12;
  return null;
}

function compactLicense(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.startsWith("IMAN") ? compact.slice(4) : compact;
}

function checksum2(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = LICENSE_ALPHABET.indexOf(data[i] ?? "");
    sum = (sum * 7 + (v + 1) * (i + 3)) % 1024;
  }
  return (
    LICENSE_ALPHABET[sum % LICENSE_ALPHABET.length] +
    LICENSE_ALPHABET[Math.floor(sum / LICENSE_ALPHABET.length) % LICENSE_ALPHABET.length]
  );
}

export function groupLicense(body: string): string {
  const parts = body.match(/.{1,4}/g) ?? [body];
  return `IMAN-${parts.join("-")}`;
}

/** Format while typing: IMAN-XXXX-XXXX-XXXX */
export function formatLicenseInput(raw: string): string {
  const body = compactLicense(raw).slice(0, 12);
  if (!body) return raw.toUpperCase().startsWith("I") ? "IMAN-" : "";
  return groupLicense(body);
}

export function normalizeLicenseCode(raw: string): string {
  const body = compactLicense(raw);
  if (body.length === 8) return groupLicense(body);
  if (body.length === 12) {
    const data = body.slice(0, 10);
    const check = body.slice(10);
    if (checksum2(data) !== check) return "";
    return groupLicense(body);
  }
  return "";
}

export function attachLicenseChecksum(data10: string): string {
  return data10 + checksum2(data10);
}

export function licenseLooksTyped(raw: string): boolean {
  const body = compactLicense(raw);
  return body.length === 8 || body.length === 12;
}
