import { createFileRoute } from "@tanstack/react-router";
import { RecoverScreen } from "@/components/recover-screen";

export const Route = createFileRoute("/recuperar")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    ...(typeof search.token === "string" && search.token ? { token: search.token } : {}),
    ...(typeof search.error === "string" && search.error ? { error: search.error } : {}),
  }),
  component: Recuperar,
});

function Recuperar() {
  const { token, error } = Route.useSearch();
  return <RecoverScreen token={token} invalid={Boolean(error)} />;
}
