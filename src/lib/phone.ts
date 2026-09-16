export const PHONE_EMAIL_DOMAIN = "phone.iman";

/** Digits only, Argentina mobile with country code (e.g. 5491112345678). */
export function normalizeARPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    if (d.length === 12 && !d.startsWith("549")) d = `549${d.slice(2)}`;
  } else if (d.startsWith("9") && d.length >= 11) {
    d = `54${d}`;
  } else if (d.startsWith("15") && d.length >= 10) {
    d = `549${d.slice(2)}`;
  } else if (d.length === 10) {
    d = `549${d}`;
  }
  if (!/^549\d{8,10}$/.test(d)) return null;
  return d;
}

export function phoneToEmail(digits: string): string {
  return `${digits}@${PHONE_EMAIL_DOMAIN}`;
}

export function emailToPhone(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^(\d+)@phone\.iman$/);
  return m?.[1] ?? null;
}

export function formatARPhone(digits: string): string {
  const d = normalizeARPhone(digits) ?? digits.replace(/\D/g, "");
  if (d.startsWith("549") && d.length >= 12) {
    const rest = d.slice(3);
    const area = rest.startsWith("11") ? "11" : rest.slice(0, 3);
    const sub = rest.slice(area.length);
    if (sub.length >= 4) {
      return `+54 9 ${area} ${sub.slice(0, sub.length - 4)}-${sub.slice(-4)}`;
    }
  }
  return d ? `+${d}` : "";
}

export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 2) return d;
  if (d.startsWith("54")) return d;
  if (d.length <= 4) return d;
  if (d.startsWith("11") && d.length > 2) {
    return `${d.slice(0, 2)} ${d.slice(2, 6)}${d.length > 6 ? `-${d.slice(6, 10)}` : ""}`.trim();
  }
  return d;
}

export function loginIdentity(raw: string): { email: string; error: string | null } {
  const t = raw.trim();
  if (!t) return { email: "", error: "Falta el teléfono" };
  if (t.includes("@")) return { email: t.toLowerCase(), error: null };
  const digits = normalizeARPhone(t);
  if (!digits) return { email: "", error: "Ingresá un celular argentino" };
  return { email: phoneToEmail(digits), error: null };
}

export function displayPhoneFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const digits = emailToPhone(email);
  return digits ? formatARPhone(digits) : email;
}
