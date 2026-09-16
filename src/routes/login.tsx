import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { LoginScreen, peekSignupConfirm } from "@/components/login-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { alta?: boolean; estudio?: boolean } => ({
    ...(search.alta === true || search.alta === "1" || search.alta === 1 ? { alta: true } : {}),
    ...(search.estudio === true || search.estudio === "1" || search.estudio === 1
      ? { estudio: true }
      : {}),
  }),
  component: Login,
});

function Login() {
  const { alta, estudio } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  if (!isPending && user && !peekSignupConfirm()) return <Navigate to="/" />;
  return (
    <div>
      <div className="absolute left-4 top-4 z-10">
        <Link to="/" className="text-sm text-muted hover:text-fg">
          Volver
        </Link>
      </div>
      <LoginScreen initialMode={alta ? "up" : "in"} estudio={Boolean(estudio)} />
    </div>
  );
}
