export const LOCAL_NAME_KEY = "iman-local-name";

type Remembered = { storeId: string; name: string };

/** El nombre del último local que se abrió en este aparato, para decirlo antes de tenerlo. */
export function rememberLocalName(storeId: string, name: string): void {
  try {
    window.localStorage.setItem(
      LOCAL_NAME_KEY,
      JSON.stringify({ storeId, name } satisfies Remembered),
    );
  } catch {
    /* quota */
  }
}

export function recallLocalName(storeId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_NAME_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Remembered>;
    return v.storeId === storeId && typeof v.name === "string" && v.name ? v.name : null;
  } catch {
    return null;
  }
}
