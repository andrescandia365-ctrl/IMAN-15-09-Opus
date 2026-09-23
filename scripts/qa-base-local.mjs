/**
 * Freno de los scripts de QA que suben de verdad (qa-arranque): solo corren
 * contra el servidor de desarrollo de esta máquina, con la base PGLite en
 * memoria. Con `DATABASE_URL` puesto, el servidor escribe en Neon.
 *
 * El script no ve el entorno del servidor, así que mira lo que sí puede: su
 * propio entorno, el `.env.local` que carga `dev:local` y que la URL sea de
 * esta máquina. No hay variable para saltearlo: si hace falta otra base, se
 * cambia este archivo a propósito.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Valor de `DATABASE_URL` en el texto de un .env, o "" si no está. */
export function databaseUrlDeEnv(texto) {
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/.exec(linea);
    if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  }
  return "";
}

/** Por qué no se puede correr, o null si la base es la local de desarrollo. */
export function motivoParaNoCorrer({ databaseUrl, envLocal, baseUrl }) {
  if (String(databaseUrl ?? "").trim()) {
    return "DATABASE_URL está puesto: el servidor escribiría en esa base, no en la local de desarrollo.";
  }
  if (databaseUrlDeEnv(envLocal)) {
    return ".env.local tiene DATABASE_URL: dev:local lo carga y el servidor escribiría en esa base.";
  }
  let host;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return `la dirección del servidor no se entiende: ${baseUrl}`;
  }
  if (!LOOPBACK.has(host)) {
    return `${host} no es esta máquina: solo se corre contra el servidor de desarrollo local.`;
  }
  return null;
}
