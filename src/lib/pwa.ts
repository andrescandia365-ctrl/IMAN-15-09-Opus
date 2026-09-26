import { FUENTES } from "@/lib/cartel-fuentes";
function collectShellUrls(): string[] {
  const urls = new Set<string>([
    "/",
    "/manifest.webmanifest",
    "/favicon.svg",
    "/icon-192.png",
    "/icon-512.png",
    window.location.href,
    // Las letras de los carteles: quedan guardadas para imprimir sin internet,
    // sin cargarse en la página hasta abrir el editor.
    ...FUENTES.map((f) => f.archivo),
  ]);
  document.querySelectorAll("script[src], link[href], img[src]").forEach((el) => {
    const v = el.getAttribute("src") || el.getAttribute("href");
    if (!v) return;
    try {
      urls.add(new URL(v, window.location.origin).href);
    } catch {
      /* skip */
    }
  });
  performance.getEntriesByType("resource").forEach((entry) => {
    if (entry.name) urls.add(entry.name);
  });
  return [...urls];
}

const SHELL_CACHE = "iman-shell-v2";

async function cacheShellFromPage(urls: string[]) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(
      urls.map(async (href) => {
        try {
          if (await cache.match(href)) return;
          const res = await fetch(href, { credentials: "same-origin" });
          if (res.ok) await cache.put(href, res);
        } catch {
          /* skip one */
        }
      }),
    );
  } catch {
    /* quota */
  }
}

function postPrecache(worker: ServiceWorker | null | undefined) {
  const urls = collectShellUrls();
  void cacheShellFromPage(urls);
  if (!worker) return;
  try {
    worker.postMessage({ type: "PRECACHE", urls });
  } catch {
    /* ignore */
  }
}

/**
 * Register the floor shell as soon as JS runs (not after window.load).
 * First online visit caches HTML/JS/CSS/fonts so the second visit — airplane
 * mode, closed tab — is IMAN, not Chrome's "No tienes conexión".
 *
 * Una versión nueva no se recarga sola: el SW espera y la página muestra un
 * cartel. Recargar en medio de una venta perdería el ticket.
 */
const updateListeners = new Set<(ready: boolean) => void>();
let waitingWorker: ServiceWorker | null = null;
let reloadWhenClaimed = false;

function setWaiting(w: ServiceWorker | null) {
  waitingWorker = w;
  for (const cb of updateListeners) cb(Boolean(w));
}

export function subscribePwaUpdate(cb: (ready: boolean) => void): () => void {
  updateListeners.add(cb);
  if (waitingWorker) cb(true);
  return () => {
    updateListeners.delete(cb);
  };
}

/** El encargado tocó el cartel: activar el SW nuevo y recargar. */
export function applyPwaUpdate() {
  if (!waitingWorker) return;
  reloadWhenClaimed = true;
  try {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  } catch {
    window.location.reload();
  }
}

export function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (window.parent !== window) return;
  const g = window as Window & { __imanPwa__?: boolean };
  if (g.__imanPwa__) return;
  g.__imanPwa__ = true;

  const send = (reg?: ServiceWorkerRegistration | null) => {
    const worker = reg?.active ?? navigator.serviceWorker.controller;
    postPrecache(worker);
  };

  const maybePrompt = (reg: ServiceWorkerRegistration) => {
    if (!reg.waiting) return;
    if (!navigator.serviceWorker.controller) {
      try {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } catch {
        /* ignore */
      }
      return;
    }
    setWaiting(reg.waiting);
  };

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      send(reg);
      maybePrompt(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed") {
            send(reg);
            maybePrompt(reg);
          }
        });
      });
      const poke = () => {
        void reg.update().catch(() => undefined);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poke();
      });
      window.setInterval(poke, 60 * 60 * 1000);
    })
    .catch((err) => {
      console.error("[pwa] sw", err);
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadWhenClaimed) {
      window.location.reload();
      return;
    }
    void navigator.serviceWorker.ready.then(send);
  });

  const afterLoad = () => {
    void navigator.serviceWorker.ready.then(send);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad);
  window.addEventListener("pageshow", afterLoad);
}
