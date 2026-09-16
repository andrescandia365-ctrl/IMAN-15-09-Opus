import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const dests = [
  join(root, ".vercel/output/functions/__server.func"),
  join(root, ".vercel/output/functions/__server.func/_libs"),
];

if (!existsSync(srcDir)) process.exit(0);

const files = readdirSync(srcDir).filter((n) => n.endsWith(".wasm") || n.endsWith(".data"));
for (const dest of dests) {
  if (!existsSync(dest)) continue;
  mkdirSync(dest, { recursive: true });
  for (const name of files) {
    copyFileSync(join(srcDir, name), join(dest, name));
  }
}
