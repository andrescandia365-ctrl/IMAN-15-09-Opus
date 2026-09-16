const KEY = "iman-floor-lock";

export type FloorLock = {
  v: 1;
  userId: string;
  displayName: string | null;
  email: string | null;
  storeId: string;
  lockedAt: string;
};

export type FloorBoot = "boot" | "landing" | "desk" | "hub";

function isLock(value: unknown): value is FloorLock {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    typeof v.userId === "string" &&
    v.userId.length > 0 &&
    typeof v.storeId === "string" &&
    v.storeId.length > 0
  );
}

export function readFloorLockSync(): FloorLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLock(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function lockFloor(row: {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  storeId: string;
}): FloorLock {
  const lock: FloorLock = {
    v: 1,
    userId: row.userId,
    displayName: row.displayName ?? null,
    email: row.email ?? null,
    storeId: row.storeId,
    lockedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lock));
    } catch {
      /* quota */
    }
  }
  return lock;
}

export function unlockFloor(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Who wins on reopen:
 * - this device already opened a local → desk (PC) / Vender (phone)
 * - signed in, never opened a local here → hub
 * - nobody on this device → landing
 * Session of the cloud is NOT required to keep the floor.
 */
export function decideFloorBoot(input: {
  mounted: boolean;
  authPending: boolean;
  userId: string | null;
  floorLock: FloorLock | null;
}): FloorBoot {
  if (!input.mounted) return "boot";
  if (input.floorLock) return "desk";
  if (!input.userId) return input.authPending ? "boot" : "landing";
  return "hub";
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
