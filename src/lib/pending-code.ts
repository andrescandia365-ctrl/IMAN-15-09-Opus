const KEY = "iman-pending-license";
const VENDOR_KEY = "iman-vendor-intent";
const PHONE_KEY = "iman-pending-phone";
const TRIAL_KEY = "iman-pending-trial";

export function savePendingCode(code: string): void {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
}

export function readPendingCode(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingCode(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function saveVendorIntent(): void {
  try {
    window.sessionStorage.setItem(VENDOR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readVendorIntent(): boolean {
  try {
    return window.sessionStorage.getItem(VENDOR_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearVendorIntent(): void {
  try {
    window.sessionStorage.removeItem(VENDOR_KEY);
  } catch {
    /* ignore */
  }
}

export function savePendingPhone(phone: string): string {
  try {
    window.sessionStorage.setItem(PHONE_KEY, phone);
  } catch {
    /* ignore */
  }
  return phone;
}

export function readPendingPhone(): string {
  try {
    return window.sessionStorage.getItem(PHONE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingPhone(): void {
  try {
    window.sessionStorage.removeItem(PHONE_KEY);
  } catch {
    /* ignore */
  }
}

export function savePendingTrial(): void {
  try {
    window.sessionStorage.setItem(TRIAL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readPendingTrial(): boolean {
  try {
    return window.sessionStorage.getItem(TRIAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPendingTrial(): void {
  try {
    window.sessionStorage.removeItem(TRIAL_KEY);
  } catch {
    /* ignore */
  }
}
