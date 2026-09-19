/* IMAN floor shell. Cache-first when the network is gone so Chrome never wins. */
const SHELL = "iman-shell-v2";
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

const OFFLINE_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#0c0d0b"/>
  <title>IMAN</title>
  <style>
    html,body{margin:0;min-height:100%;background:#0c0d0b;color:#f4f1e8;font-family:system-ui,sans-serif}
    body{display:grid;place-items:center}
    h1{font-size:2.5rem;letter-spacing:-.03em;margin:0;font-weight:600}
    p{margin:.6rem 0 0;opacity:.55;font-size:.9rem}
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>IMAN</h1>
    <p>Abriendo el mostrador…</p>
  </div>
</body>
</html>`;

function isNav(req) {
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  return req.method === "GET" && accept.includes("text/html");
}

function skipNetworkOnly(url) {
  const path = url.pathname;
  if (path.startsWith("/api")) return true;
  if (path.includes("_server")) return true;
  if (path.startsWith("/__grok")) return true;
  if (path.startsWith("/auth/")) return true;
  if (url.searchParams.has("install")) return true;
  return false;
}

function isFontCdn(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function offlineDoc() {
  return new Response(OFFLINE_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function offlineAsset() {
  return new Response("", { status: 504, statusText: "offline" });
}

async function putOk(cache, req, res) {
  if (!res || !res.ok) return;
  if (res.type === "opaque" || res.type === "opaqueredirect") return;
  try {
    await cache.put(req, res.clone());
  } catch {
    /* ignore quota / invalid */
  }
}

async function precacheList(urls) {
  const cache = await caches.open(SHELL);
  const unique = [];
  const seen = new Set();
  for (const raw of urls) {
    if (typeof raw !== "string" || !raw) continue;
    let href = raw;
    try {
      const u = new URL(raw, self.location.origin);
      if (!sameOrigin(u) && !isFontCdn(u)) continue;
      if (skipNetworkOnly(u)) continue;
      href = u.href;
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    unique.push(href);
  }
  await Promise.all(
    unique.map(async (href) => {
      try {
        const req = new Request(href, { credentials: href.startsWith(self.location.origin) ? "same-origin" : "omit" });
        const hit = await cache.match(req);
        if (hit) return;
        const res = await fetch(req);
        await putOk(cache, req, res);
      } catch {
        /* skip one URL, keep the rest */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => undefined)));
      // No skipWaiting acá: si ya hay un mostrador abierto, el JS viejo sigue
      // hasta que el encargado toque "actualizar". El primer install lo pide
      // la página (no hay controller todavía).
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "PRECACHE" && Array.isArray(data.urls)) {
    const done = precacheList(data.urls).then(() => {
      try {
        event.source?.postMessage({ type: "PRECACHE_DONE" });
      } catch {
        /* ignore */
      }
    });
    if (event.waitUntil) event.waitUntil(done);
  }
});

async function navResponse(req) {
  const cache = await caches.open(SHELL);
  try {
    const net = await fetch(req);
    if (net.ok) {
      await putOk(cache, req, net);
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "") {
        await putOk(cache, new Request("/"), net);
      }
    }
    return net;
  } catch {
    return (
      (await cache.match(req)) ||
      (await cache.match("/")) ||
      (await cache.match(new Request("/"))) ||
      offlineDoc()
    );
  }
}

async function assetResponse(req) {
  const cache = await caches.open(SHELL);
  try {
    const net = await fetch(req);
    await putOk(cache, req, net);
    return net;
  } catch {
    return (await cache.match(req)) || offlineAsset();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (sameOrigin(url) && skipNetworkOnly(url)) return;

  if (isNav(req) && sameOrigin(url)) {
    event.respondWith(navResponse(req));
    return;
  }

  if (sameOrigin(url) || isFontCdn(url)) {
    event.respondWith(assetResponse(req));
  }
});
