import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePhoneUi } from "@/lib/device";
import { getDeviceId } from "@/lib/local-db";
import { cajaMasNueva, puedeCobrar, rolDe, type CajaServidor, type Rol } from "@/lib/rol";

/**
 * Lo que este aparato sabe de la caja de cada local: la última respuesta del
 * servidor. Sin red se sigue usando: un corte de internet no le saca la caja a
 * nadie. Vive aparte del candado del mostrador (iman-floor-lock), a propósito.
 */
const clave = (storeId: string) => `iman-caja:${storeId}`;
const EVENTO = "iman-caja";

function leer(storeId: string): string | null {
  if (typeof window === "undefined" || !storeId) return null;
  try {
    return window.localStorage.getItem(clave(storeId));
  } catch {
    return null;
  }
}

function parsear(raw: string | null): CajaServidor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CajaServidor>;
    return { device: typeof v.device === "string" ? v.device : null, ver: Number(v.ver) || 0 };
  } catch {
    return null;
  }
}

export function cajaSabida(storeId: string): CajaServidor | null {
  return parsear(leer(storeId));
}

/** Anota lo que dijo el servidor, si es más nuevo que lo que ya se sabía. */
export function anotarCaja(storeId: string, llega: CajaServidor | null | undefined): void {
  if (!storeId || !llega) return;
  const sabida = cajaSabida(storeId);
  const next = cajaMasNueva(sabida, llega);
  if (!next || (sabida && next.device === sabida.device && next.ver === sabida.ver)) return;
  try {
    window.localStorage.setItem(clave(storeId), JSON.stringify(next));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(cb: () => void): () => void {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

/** El rol de este aparato en el local, y si puede cobrar (ver rol.ts). */
export function useRol(storeId: string): { rol: Rol; puedeCobrar: boolean; caja: CajaServidor | null } {
  const raw = useSyncExternalStore(suscribir, () => leer(storeId), () => null);
  const celu = usePhoneUi();
  return useMemo(() => {
    const caja = parsear(raw);
    const rol = rolDe(caja, getDeviceId());
    return { rol, puedeCobrar: puedeCobrar(rol, celu), caja };
  }, [raw, celu]);
}

const VIGILAR_MS = 2 * 60 * 1000;

/**
 * Pregunta quién es la caja al volver a la app, al volver la red y cada dos
 * minutos con la app a la vista. Así un aparato que dejó de ser la caja se
 * entera aunque no venda ni sincronice.
 */
export function useVigilarCaja(storeId: string, consultar: (storeId: string) => Promise<CajaServidor>): void {
  useEffect(() => {
    if (!storeId) return;
    let vivo = true;
    const mirar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void consultar(storeId)
        .then((c) => {
          if (vivo) anotarCaja(storeId, c);
        })
        .catch(() => {});
    };
    mirar();
    const t = window.setInterval(mirar, VIGILAR_MS);
    document.addEventListener("visibilitychange", mirar);
    window.addEventListener("online", mirar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", mirar);
      window.removeEventListener("online", mirar);
    };
  }, [storeId, consultar]);
}
