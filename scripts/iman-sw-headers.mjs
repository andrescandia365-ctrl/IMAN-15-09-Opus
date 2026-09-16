import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, ".vercel/output/config.json");
const staticDir = join(root, ".vercel/output/static");
const swPath = join(staticDir, "sw.js");

if (existsSync(configPath)) {
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  if (Array.isArray(cfg.routes)) {
    const rule = {
      src: "/sw.js",
      headers: {
        "cache-control": "no-cache, no-store, must-revalidate",
        "service-worker-allowed": "/",
        "content-type": "application/javascript; charset=utf-8",
      },
      continue: true,
    };
    cfg.routes = cfg.routes.filter((r) => r.src !== "/sw.js");
    const idx = cfg.routes.findIndex((r) => r.handle === "filesystem");
    if (idx >= 0) cfg.routes.splice(idx, 0, rule);
    else cfg.routes.unshift(rule);
    writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  }
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(`/${relative(staticDir, p).replaceAll("\\", "/")}`);
  }
  return acc;
}

if (existsSync(swPath)) {
  const files = walk(staticDir).filter(
    (f) =>
      f === "/manifest.webmanifest" ||
      f === "/favicon.svg" ||
      /\.(js|css|png|svg|woff2?)$/i.test(f) &&
        !f.startsWith("/__grok/") &&
        !/\.(wasm|data)$/i.test(f),
  );
  const precache = ["/", ...new Set(files)];
  let src = readFileSync(swPath, "utf8");
  src = src.replace(
    /const PRECACHE = \[[^\]]*\];/,
    `const PRECACHE = ${JSON.stringify(precache)};`,
  );
  writeFileSync(swPath, src);
}
