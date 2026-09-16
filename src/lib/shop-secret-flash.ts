const KEY = "iman-shop-secret-once";

export function saveFlashSecret(secret: string): void {
  try {
    window.sessionStorage.setItem(KEY, secret);
  } catch {
    /* ignore */
  }
}

export function readFlashSecret(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearFlashSecret(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
