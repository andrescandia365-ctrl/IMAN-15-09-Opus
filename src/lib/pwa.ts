function collectShellUrls(): string[] {
  const urls = new Set<string>([
    "/",
    "/manifest.webmanifest",
    "/favicon.svg",
    "/icon-192.png",
    "/icon-512.png",
    window.location.href,
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
 */
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

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      send(reg);
      if (reg.waiting) {
        try {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } catch {
          /* ignore */
        }
      }
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed") send(reg);
        });
      });
    })
    .catch((err) => {
      console.error("[pwa] sw", err);
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void navigator.serviceWorker.ready.then(send);
  });

  const afterLoad = () => {
    void navigator.serviceWorker.ready.then(send);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad);
  window.addEventListener("pageshow", afterLoad);
}
