import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { FOUNDER_EMAIL, FOUNDER_NAME } from "@/lib/founder-public";

export { FOUNDER_EMAIL, FOUNDER_NAME, isFounderEmail } from "@/lib/founder-public";

/**
 * Clave del Estudio. Vive solo en el entorno del servidor (`IMAN_ESTUDIO_PASSWORD`):
 * si vuelve al código viaja en el bundle del navegador y en git.
 */
export function estudioPassword(): string {
  return (typeof process !== "undefined" ? process.env.IMAN_ESTUDIO_PASSWORD : "")?.trim() ?? "";
}

export function estudioPasswordConfigured(): boolean {
  return estudioPassword().length > 0;
}

let once: Promise<string | null> | null = null;
let oncePass = "";

/** Crea / repara la cuenta del Estudio y la deja como vendedor. */
export function ensureFounder(): Promise<string | null> {
  const pass = estudioPassword();
  if (oncePass !== pass) {
    once = null;
    oncePass = pass;
  }
  once ??= run(pass).catch((err) => {
    once = null;
    console.error("[iman] estudio:", err);
    return null;
  });
  return once;
}

async function run(pass: string): Promise<string | null> {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${FOUNDER_EMAIL} limit 1
  `;
  const userId = existing[0]?.id ?? `usr_${randomBytes(12).toString("hex")}`;
  if (!existing[0]) {
    await sql`
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values (${userId}, ${FOUNDER_NAME}, ${FOUNDER_EMAIL}, true, now(), now())
    `;
  }
  // Sin clave en el entorno no se toca la cuenta: mejor no poder entrar que
  // dejar una clave conocida.
  if (pass) {
    const hash = await hashPassword(pass);
    const acc = await sql<{ id: string }>`
      select id from "account"
      where "userId" = ${userId} and "providerId" = 'credential'
      limit 1
    `;
    if (!acc[0]) {
      const accId = `acc_${randomBytes(12).toString("hex")}`;
      await sql`
        insert into "account" (
          id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
        )
        values (${accId}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())
      `;
    } else {
      await sql`
        update "account"
        set password = ${hash}, "updatedAt" = now()
        where id = ${acc[0].id}
      `;
    }
  }

  const vendor = await sql<{ user_id: string; shop_secret: string }>`
    select user_id, shop_secret from iman_vendor where id = 'vendor' limit 1
  `;
  if (!vendor[0]) {
    const secret = randomBytes(24).toString("base64url");
    await sql`
      insert into iman_vendor (id, user_id, seller_name, sales_url, shop_secret)
      values ('vendor', ${userId}, 'IMAN', '', ${secret})
    `;
  } else if (vendor[0].user_id !== userId) {
    await sql`update iman_vendor set user_id = ${userId} where id = 'vendor'`;
  }
  return userId;
}
