import { createFileRoute } from "@tanstack/react-router";
import { subscribeDesk } from "@/lib/desk-bus";
import { pendingDeskTickets } from "@/lib/desk-ticket";
import { DEV_USER_ID } from "@/lib/auth/verify.server";
import { gateIdentityEnabled } from "@/lib/auth/gate-identity.server";
import { auth, authConfigured } from "@/lib/auth/server";

async function userIdOf(request: Request): Promise<string> {
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  if (!authConfigured && !gateIdentityEnabled()) {
    if (databaseConfigured) throw new Error("Unauthorized");
    return DEV_USER_ID;
  }
  const url = new URL(request.url);
  const token =
    url.searchParams.get("access_token") ||
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") ||
    "";
  const headers = new Headers(request.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export const Route = createFileRoute("/api/desk-inbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const storeId = url.searchParams.get("storeId")?.trim() ?? "";
        if (!storeId) return Response.json({ error: "Falta el local" }, { status: 400 });
        let userId: string;
        try {
          userId = await userIdOf(request);
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const encoder = new TextEncoder();
        let unsub = () => undefined as void;
        let ping: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            unsub = subscribeDesk(userId, storeId, (ticket) => send("ticket", ticket));
            try {
              const pending = await pendingDeskTickets(userId, storeId);
              for (const t of pending.reverse()) send("ticket", t);
            } catch {
              send("hello", { ok: true });
            }
            ping = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: ping\n\n`));
              } catch {
                if (ping) clearInterval(ping);
              }
            }, 15000);
          },
          cancel() {
            unsub();
            if (ping) clearInterval(ping);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
