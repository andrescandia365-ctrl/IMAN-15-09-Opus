const TTL_MS = 20 * 60 * 1000;
let unlockedUntil = 0;

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`iman.dueno.v1:${pin.trim()}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function pinLooksOk(pin: string): boolean {
  return /^\d{4,8}$/.test(pin.trim());
}

export function isOwnerUnlocked(): boolean {
  return Date.now() < unlockedUntil;
}

export function unlockOwner(): void {
  unlockedUntil = Date.now() + TTL_MS;
}

export function lockOwner(): void {
  unlockedUntil = 0;
}
