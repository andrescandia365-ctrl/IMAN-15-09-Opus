import { createFileRoute } from "@tanstack/react-router";
import { fulfillWooLicense } from "@/lib/license";

async function handle(request: Request): Promise<Response> {
  if (request.method === "GET" || request.method === "HEAD") {
    return Response.json({ ok: true, service: "iman-woo", hint: "POST order.completed" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  const rawBody = await request.text();
  const headerAuth = request.headers.get("authorization") ?? "";
  const bearer = headerAuth.toLowerCase().startsWith("bearer ")
    ? headerAuth.slice(7).trim()
    : request.headers.get("x-iman-secret");
  const signature = request.headers.get("x-wc-webhook-signature");
  const result = await fulfillWooLicense({ rawBody, bearer, signature });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  return Response.json({
    ok: true,
    code: result.code,
    months: result.months,
    activate_path: result.activate_path,
    email: result.email,
  });
}

export const Route = createFileRoute("/api/woo/issue")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      OPTIONS: ({ request }) => handle(request),
    },
  },
});
